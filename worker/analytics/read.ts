import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { accuracy, defaultDifficulty, difficultyFor, minimumDifficultySample, minimumPublicSample, type StudyStatistics } from '../../shared/study-statistics'
import { usageShare } from './budget'
import { studyStatistics, studyStatisticsJob, studyStatisticsSettings } from './schema'

export function boundariesFrom(row: typeof studyStatisticsSettings.$inferSelect | undefined): readonly number[] {
  return row ? [row.veryEasy, row.easy, row.medium, row.hard] : defaultDifficulty
}

export async function readStudyStatistics(db: D1Database, userId: string, no: number, version: number): Promise<StudyStatistics | undefined> {
  const orm = drizzle(db)
  const [budget] = await orm.select().from(studyStatisticsJob).where(eq(studyStatisticsJob.id, 1))
  if (!budget) return
  if (budget.status === 'paused' || budget.status === 'metrics_unavailable') return {
    sample: null, firstAccuracy: null, wrongRate: null, difficulty: null,
    mine: { accuracy: null, wrong: null }, calculatedAt: budget.calculatedAt, delayed: true, paused: true,
  }
  const [[stats], [settings], personal] = await Promise.all([
    orm.select().from(studyStatistics).where(and(eq(studyStatistics.no, no), eq(studyStatistics.version, version))),
    orm.select().from(studyStatisticsSettings).where(eq(studyStatisticsSettings.id, 1)),
    db.prepare(`SELECT count(*) AS total, COALESCE(sum(is_correct), 0) AS correct FROM study_attempts
      WHERE user_id = ? AND kind = 'study' AND no = ? AND statistics_version = ?`)
      .bind(userId, no, version).first<{ total: number; correct: number }>(),
  ])
  const sample = stats ? stats.firstCorrect + stats.firstWrong : 0
  const published = stats && sample >= minimumPublicSample
  const wrong = stats ? stats.firstWrong + stats.repeatWrong : 0
  const total = stats ? sample + stats.repeatCorrect + stats.repeatWrong : 0
  return {
    sample: published ? sample : null,
    firstAccuracy: published ? accuracy(stats.firstCorrect, sample) : null,
    wrongRate: published ? accuracy(wrong, total) : null,
    difficulty: stats ? difficultyFor(stats.firstCorrect, sample, boundariesFrom(settings)) : null,
    mine: { accuracy: accuracy(personal?.correct ?? 0, personal?.total ?? 0), wrong: (personal?.total ?? 0) - (personal?.correct ?? 0) },
    calculatedAt: budget.calculatedAt,
    delayed: budget.status !== 'ready',
  }
}

export async function recommendStudyQuestions(db: D1Database, userId: string, stage: number) {
  const { results } = await db.prepare(`
    WITH recent AS (
      SELECT no, statistics_version, is_correct, occurred_at, event_id
      FROM study_attempts WHERE user_id = ? AND kind = 'study'
      ORDER BY occurred_at DESC, event_id DESC LIMIT 300
    ), active AS (
      SELECT recent.*, q.part, q.chapter, q.section,
        row_number() OVER (PARTITION BY q.no ORDER BY occurred_at DESC, event_id DESC) AS recent_rank,
        avg(1 - is_correct) OVER (PARTITION BY q.part, q.chapter, q.section) AS topic_wrong
      FROM recent JOIN book_questions q ON q.no = recent.no
      LEFT JOIN study_statistics_versions v ON v.no = q.no AND v.revision = q.active_revision
      WHERE q.stage = ? AND recent.statistics_version = COALESCE(v.statistics_version, q.active_revision)
    ), mistakes AS (
      SELECT no, SUM(is_correct = 0) AS wrong, MAX(occurred_at) AS last_at, MAX(topic_wrong) AS topic_wrong
      FROM active GROUP BY no HAVING MAX(CASE WHEN recent_rank = 1 THEN is_correct END) = 0
    )
    SELECT no FROM mistakes ORDER BY topic_wrong DESC, wrong DESC, last_at DESC, no LIMIT 10
  `).bind(userId, stage).all<{ no: number }>()
  return results.map(({ no }) => no)
}

export async function recommendCommonMistakes(db: D1Database, stage: number) {
  const [budget] = await drizzle(db).select().from(studyStatisticsJob).where(eq(studyStatisticsJob.id, 1))
  if (!budget?.observedAt || budget.status !== 'ready' || usageShare({
    reads: budget.accountReads ?? 0, writes: budget.accountWrites ?? 0, requests: budget.accountRequests ?? 0,
  }) >= 0.85) return []
  const { results } = await db.prepare(`
    SELECT stats.no FROM study_statistics stats
    JOIN book_questions q ON q.no = stats.no
    LEFT JOIN study_statistics_versions v ON v.no = q.no AND v.revision = q.active_revision
    WHERE q.stage = ? AND stats.statistics_version = COALESCE(v.statistics_version, q.active_revision)
      AND first_correct + first_wrong >= ?
      AND first_wrong > first_correct
    ORDER BY 1.0 * first_wrong / (first_correct + first_wrong) DESC, first_correct + first_wrong DESC, stats.no
    LIMIT 10
  `).bind(stage, minimumDifficultySample).all<{ no: number }>()
  return results.map(({ no }) => no)
}
