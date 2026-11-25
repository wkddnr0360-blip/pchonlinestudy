import { and, desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'
import { accuracy, difficultyFor, minimumDifficultySample, type StatisticsAdminPage } from '../../shared/study-statistics'
import { usageShare } from './budget'
import { boundariesFrom } from './read'
import { studyStatistics as stats, studyStatisticsJob, studyStatisticsSettings } from './schema'

const questions = sqliteTable('book_questions', {
  no: integer().primaryKey(), stage: integer().notNull(), part: integer().notNull(),
  chapter: integer().notNull(), section: integer(),
})
const join = eq(questions.no, stats.no)
const sample = sql<number>`(${stats.firstCorrect} + ${stats.firstWrong})`
const total = sql<number>`(${sample} + ${stats.repeatCorrect} + ${stats.repeatWrong})`
const wrong = sql<number>`(${stats.firstWrong} + ${stats.repeatWrong})`
const quality = sql`${sample} >= ${minimumDifficultySample}
  AND (${stats.firstCorrect} * 100 < 30 * ${sample} OR ${wrong} * 100 >= 70 * ${total})`

export async function readStatisticsAdmin(db: D1Database, filters: {
  page: number; stage?: number; part?: number; chapter?: number; section?: number; version?: number; flagged: boolean
}): Promise<StatisticsAdminPage> {
  const orm = drizzle(db)
  const [[budget], [settings]] = await Promise.all([
    orm.select().from(studyStatisticsJob).where(eq(studyStatisticsJob.id, 1)),
    orm.select().from(studyStatisticsSettings).where(eq(studyStatisticsSettings.id, 1)),
  ])
  const boundaries = [...boundariesFrom(settings)]
  const flagsPaused = !budget.observedAt || budget.status === 'paused' || budget.status === 'metrics_unavailable'
    || usageShare({ reads: budget.accountReads ?? 0, writes: budget.accountWrites ?? 0, requests: budget.accountRequests ?? 0 }) >= 0.85
  const filtersSql = and(
    filters.stage !== undefined ? eq(questions.stage, filters.stage) : undefined,
    filters.part !== undefined ? eq(questions.part, filters.part) : undefined,
    filters.chapter !== undefined ? eq(questions.chapter, filters.chapter) : undefined,
    filters.section !== undefined ? eq(questions.section, filters.section) : undefined,
    filters.version !== undefined ? eq(stats.version, filters.version) : undefined,
    filters.flagged ? (flagsPaused ? sql`0` : quality) : undefined,
  )
  const [rows, [totals]] = await Promise.all([
    orm.select({
      no: stats.no, stage: questions.stage, part: questions.part, chapter: questions.chapter, section: questions.section,
      version: stats.version, firstCorrect: stats.firstCorrect, firstWrong: stats.firstWrong, repeatCorrect: stats.repeatCorrect,
      repeatWrong: stats.repeatWrong, selected: stats.selectedO, timed: stats.timedCount, elapsed: stats.elapsedMs,
    }).from(stats).innerJoin(questions, join).where(filtersSql)
      .orderBy(desc(sample), stats.no, desc(stats.version)).limit(21).offset((filters.page - 1) * 20),
    orm.select({
      attempts: sql<number>`COALESCE(SUM(${total}), 0)`,
      firstCorrect: sql<number>`COALESCE(SUM(${stats.firstCorrect}), 0)`,
      firstWrong: sql<number>`COALESCE(SUM(${stats.firstWrong}), 0)`,
      repeatCorrect: sql<number>`COALESCE(SUM(${stats.repeatCorrect}), 0)`,
      repeatWrong: sql<number>`COALESCE(SUM(${stats.repeatWrong}), 0)`,
    }).from(stats).innerJoin(questions, join).where(filtersSql),
  ])
  const items = rows.slice(0, 20).map(({ firstCorrect, firstWrong, repeatCorrect, repeatWrong, selected, timed, elapsed, ...row }) => {
    const firstCount = firstCorrect + firstWrong
    const repeatCount = repeatCorrect + repeatWrong
    const count = firstCount + repeatCount
    const flags: string[] = []
    if (!flagsPaused && firstCount >= minimumDifficultySample) {
      if (firstCorrect * 100 < 30 * firstCount) flags.push('낮은 최초 정답률')
      if ((firstWrong + repeatWrong) * 100 >= 70 * count) flags.push('오답 선택 집중')
    }
    return {
      ...row, sample: firstCount, total: count, firstAccuracy: accuracy(firstCorrect, firstCount),
      repeatAccuracy: accuracy(repeatCorrect, repeatCount), selectedO: accuracy(selected, count),
      meanSeconds: timed ? Math.round(elapsed / timed / 100) / 10 : null,
      difficulty: difficultyFor(firstCorrect, firstCount, boundaries), flags,
    }
  })
  return { items, next: rows.length > 20, totals, budget, boundaries, qualityPaused: flagsPaused }
}
