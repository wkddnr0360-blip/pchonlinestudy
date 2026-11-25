import { sql } from 'drizzle-orm'
import { check, foreignKey, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { StatisticsStatus } from '../../shared/study-statistics'

const revisions = sqliteTable('question_revisions', {
  no: integer().notNull(),
  revision: integer().notNull(),
}, (t) => [primaryKey({ columns: [t.no, t.revision] })])

export const studyStatisticsVersions = sqliteTable('study_statistics_versions', {
  no: integer().notNull(),
  revision: integer().notNull(),
  version: integer('statistics_version').notNull(),
}, (t) => [
  primaryKey({ columns: [t.no, t.revision] }),
  foreignKey({ columns: [t.no, t.revision], foreignColumns: [revisions.no, revisions.revision] }),
  foreignKey({ columns: [t.no, t.version], foreignColumns: [revisions.no, revisions.revision] }),
  check('version_order', sql`${t.version} <= ${t.revision}`),
])

export const studyStatistics = sqliteTable('study_statistics', {
  no: integer().notNull(),
  version: integer('statistics_version').notNull(),
  firstCorrect: integer('first_correct').notNull(),
  firstWrong: integer('first_wrong').notNull(),
  repeatCorrect: integer('repeat_correct').notNull(),
  repeatWrong: integer('repeat_wrong').notNull(),
  selectedO: integer('selected_o').notNull(),
  timedCount: integer('timed_count').notNull(),
  elapsedMs: integer('elapsed_ms').notNull(),
}, (t) => [
  primaryKey({ columns: [t.no, t.version] }),
  foreignKey({ columns: [t.no, t.version], foreignColumns: [revisions.no, revisions.revision] }),
])

export const studyStatisticsJob = sqliteTable('study_statistics_job', {
  id: integer().primaryKey(),
  cursor: integer().notNull().default(0),
  day: integer().notNull().default(0),
  reads: integer().notNull().default(0),
  writes: integer().notNull().default(0),
  calculatedAt: integer('calculated_at'),
  status: text().$type<StatisticsStatus>().notNull().default('collecting'),
  accountReads: integer('account_reads'),
  accountWrites: integer('account_writes'),
  accountRequests: integer('account_requests'),
  observedAt: integer('observed_at'),
}, (t) => [
  check('job_singleton', sql`${t.id} = 1`),
  check('job_status', sql`${t.status} IN ('collecting', 'ready', 'delayed', 'paused', 'metrics_unavailable')`),
])

export const studyStatisticsSettings = sqliteTable('study_statistics_settings', {
  id: integer().primaryKey(),
  veryEasy: integer('very_easy').notNull().default(90),
  easy: integer().notNull().default(75),
  medium: integer().notNull().default(50),
  hard: integer().notNull().default(30),
}, (t) => [
  check('settings_singleton', sql`${t.id} = 1`),
  check('difficulty_order', sql`100 >= ${t.veryEasy} AND ${t.veryEasy} > ${t.easy} AND ${t.easy} > ${t.medium} AND ${t.medium} > ${t.hard} AND ${t.hard} > 0`),
])
