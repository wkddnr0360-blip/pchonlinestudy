import type { AppEnv } from '../index'
import type { StatisticsStatus } from '../../shared/study-statistics'
import { dayMilliseconds, readAccountUsage, statisticsReadBudget, statisticsWriteBudget, usageShare } from './budget'

interface Checkpoint { cursor: number; day: number; reads: number; writes: number; calculated_at: number | null }
const matchesCheckpoint = 'cursor = ? AND day = ? AND reads = ? AND writes = ?'

export async function runStudyStatistics(env: AppEnv, now: number) {
  if (env.ANALYTICS_ENABLED !== '1') return
  const db = env.DB
  const day = Math.floor(now / dayMilliseconds)
  const checkpoint = await db.prepare('SELECT cursor, day, reads, writes, calculated_at FROM study_statistics_job WHERE id = 1').first<Checkpoint>()
  if (!checkpoint || checkpoint.day > day) return
  const expected = [checkpoint.cursor, checkpoint.day, checkpoint.reads, checkpoint.writes] as const
  const reads = checkpoint.day === day ? checkpoint.reads : 0
  const writes = checkpoint.day === day ? checkpoint.writes : 0
  if (writes >= statisticsWriteBudget || reads >= statisticsReadBudget) return

  const usage = await readAccountUsage(env, now).catch(() => null)
  const readHeadroom = Math.min(statisticsReadBudget - reads, 4_750_000 - (usage?.reads ?? 4_750_000))
  const writeHeadroom = Math.min(statisticsWriteBudget - writes, 95_000 - (usage?.writes ?? 95_000))
  const maxRows = Math.max(0, Math.min(500, Math.floor((readHeadroom - 10) / 6), Math.floor((writeHeadroom - 1) / 2)))
  const status: StatisticsStatus = !usage ? 'metrics_unavailable'
    : usageShare(usage) >= 0.95 || maxRows === 0 ? 'paused' : 'collecting'
  const window = status === 'collecting' ? await db.prepare(`
    SELECT max(rowid) AS last, count(*) AS rows,
      count(DISTINCT CASE WHEN statistics_version IS NOT NULL THEN no || ':' || statistics_version END) AS groups
    FROM (SELECT rowid, no, statistics_version FROM study_attempts WHERE rowid > ? ORDER BY rowid LIMIT ?)
  `).bind(checkpoint.cursor, maxRows).first<{ last: number | null; rows: number; groups: number }>() : null
  const last = window?.last ?? checkpoint.cursor
  // Reserve for both rowid scans, the upsert key lookups, and the checkpoint.
  const nextReads = Math.min(statisticsReadBudget, reads + (window?.rows ?? 0) * 6 + 10)
  const nextWrites = writes + (window?.groups ?? 0) * 2 + 1
  const nextStatus = !window ? status : nextReads >= statisticsReadBudget || nextWrites >= statisticsWriteBudget ? 'paused'
    : window.rows === maxRows ? 'delayed' : 'ready'
  const update = db.prepare(`UPDATE study_statistics_job
    SET cursor = ?, day = ?, reads = ?, writes = ?, status = ?, calculated_at = ?,
      account_reads = ?, account_writes = ?, account_requests = ?, observed_at = ?
    WHERE id = 1 AND ${matchesCheckpoint}`)
    .bind(last, day, nextReads, nextWrites, nextStatus, window ? now : checkpoint.calculated_at,
      usage?.reads ?? null, usage?.writes ?? null, usage?.requests ?? null, usage ? now : null, ...expected)
  if (last === checkpoint.cursor) { await update.run(); return }

  const rollup = db.prepare(`
    INSERT INTO study_statistics
      (no, statistics_version, first_correct, first_wrong, repeat_correct, repeat_wrong, selected_o, timed_count, elapsed_ms)
    SELECT no, statistics_version,
      SUM(statistics_first = 1 AND is_correct = 1), SUM(statistics_first = 1 AND is_correct = 0),
      SUM(statistics_first = 0 AND is_correct = 1), SUM(statistics_first = 0 AND is_correct = 0),
      SUM(choice = 'O'), COUNT(elapsed_ms), COALESCE(SUM(elapsed_ms), 0)
    FROM study_attempts
    WHERE rowid > ? AND rowid <= ? AND statistics_version IS NOT NULL
      AND EXISTS (SELECT 1 FROM study_statistics_job WHERE id = 1 AND ${matchesCheckpoint})
    GROUP BY no, statistics_version
    ON CONFLICT(no, statistics_version) DO UPDATE SET
      first_correct = first_correct + excluded.first_correct, first_wrong = first_wrong + excluded.first_wrong,
      repeat_correct = repeat_correct + excluded.repeat_correct, repeat_wrong = repeat_wrong + excluded.repeat_wrong,
      selected_o = selected_o + excluded.selected_o, timed_count = timed_count + excluded.timed_count,
      elapsed_ms = elapsed_ms + excluded.elapsed_ms
  `).bind(checkpoint.cursor, last, ...expected)
  await db.batch([rollup, update])
}
