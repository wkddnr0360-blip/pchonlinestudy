import type { ExplanationBlock, Ox, Stage } from '../../src/book/types'
import { questionId, type LegacyAttempt, type StudyIndexEntry, type StudyOutlineLabel, type StudyProgress, type StudyQuestion, type StudyResult } from '../../shared/study'
import { captureStudyAttempt } from '../analytics/capture'

export type StageLimit = 1 | 3

export async function withinStudyLimit(db: D1Database, userId: string, action: string, now: number, limit: number, period = 60_000) {
  const slot = Math.floor(now / period)
  return await db.prepare(`
    INSERT INTO study_rate_limits (user_id, action, slot, hits) VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, action) DO UPDATE SET
      hits = CASE WHEN excluded.slot > slot THEN 1 ELSE hits + 1 END,
      slot = MAX(slot, excluded.slot)
    WHERE excluded.slot > slot OR hits < ?
    RETURNING hits
  `).bind(userId, action, slot, limit).first() !== null
}

export async function studyCatalog(db: D1Database, maxStage: StageLimit) {
  const [questions, outline] = await db.batch([
    db.prepare('SELECT no, stage, part, chapter, section FROM book_questions WHERE stage <= ? ORDER BY no').bind(maxStage),
    db.prepare('SELECT stage, part, chapter, section, label, printed_page AS printedPage FROM book_outline WHERE stage <= ? ORDER BY stage, part, chapter, section').bind(maxStage),
  ])
  return { questions: questions.results as StudyIndexEntry[], outline: outline.results as StudyOutlineLabel[] }
}

export async function readStudyQuestion(db: D1Database, no: number, maxStage: StageLimit): Promise<StudyQuestion | null> {
  const row = await db.prepare(`
    SELECT q.no, q.stage, rev.revision, rev.prompt, rev.source
    FROM book_questions q JOIN question_revisions rev ON rev.no = q.no AND rev.revision = q.active_revision
    WHERE q.no = ? AND q.stage <= ?
  `).bind(no, maxStage).first<Omit<StudyQuestion, 'id'>>()
  return row && { id: questionId(row.no), ...row }
}

export async function gradeStudyAnswer(db: D1Database, userId: string, maxStage: StageLimit, no: number, revision: number, eventId: string, choice: Ox, now: number, timing?: { elapsedMs: number | null }) {
  const [_, grade, accessible] = await db.batch([
    timing ? captureStudyAttempt(db, userId, maxStage, no, revision, eventId, choice, now, timing.elapsedMs) : db.prepare(`
      INSERT INTO study_attempts (user_id, event_id, kind, no, choice, revision, is_correct, occurred_at, received_at)
      SELECT ?, ?, 'study', q.no, ?, rev.revision, rev.answer = ?, ?, ?
      FROM book_questions q JOIN question_revisions rev ON rev.no = q.no AND rev.revision = q.active_revision
      WHERE q.no = ? AND q.stage <= ? AND rev.revision = ?
      ON CONFLICT(user_id, kind, event_id) DO NOTHING
    `).bind(userId, eventId, choice, choice, now, now, no, maxStage, revision),
    db.prepare(`
      SELECT att.no, att.revision, att.choice, att.is_correct AS correct, rev.answer, rev.marker, rev.explanation,
        ${timing ? 'att.statistics_version' : 'NULL'} AS statisticsVersion
      FROM study_attempts att
      JOIN book_questions q ON q.no = att.no
      JOIN question_revisions rev ON rev.no = att.no AND rev.revision = att.revision
      WHERE att.user_id = ? AND att.kind = 'study' AND att.event_id = ? AND q.stage <= ?
    `).bind(userId, eventId, maxStage),
    db.prepare('SELECT no FROM book_questions WHERE no = ? AND stage <= ?').bind(no, maxStage),
  ])
  const row = grade.results[0] as {
    no: number; revision: number; choice: Ox; correct: 0 | 1; answer: Ox; marker: StudyResult['marker']; explanation: string
    statisticsVersion: number | null
  } | undefined
  if (!accessible.results.length) return { error: 'not_found', status: 404 } as const
  if (!row) return { error: 'stale_question', status: 409 } as const
  if (row.no !== no || row.revision !== revision || row.choice !== choice) {
    return { error: 'attempt_conflict', status: 409 } as const
  }
  const { answer, marker, correct, explanation } = row
  return {
    result: { answer, marker, correct: Boolean(correct), explanation: JSON.parse(explanation) as ExplanationBlock[] },
    statisticsVersion: row.statisticsVersion,
  }
}

export async function studyProgress(db: D1Database, userId: string, maxStage: StageLimit): Promise<StudyProgress> {
  const [counts, latest] = await db.batch([
    db.prepare(`
      SELECT COUNT(DISTINCT CASE WHEN kind = 'study' THEN att.no END) AS attempted,
        COUNT(CASE WHEN kind = 'legacy' THEN 1 END) AS imported
      FROM study_attempts att JOIN book_questions q ON q.no = att.no
      WHERE att.user_id = ? AND q.stage <= ?
    `).bind(userId, maxStage),
    db.prepare(`
      SELECT att.no FROM study_attempts att JOIN book_questions q ON q.no = att.no
      WHERE att.user_id = ? AND q.stage <= ? ORDER BY occurred_at DESC, att.event_id DESC LIMIT 1
    `).bind(userId, maxStage),
  ])
  const { attempted, imported } = counts.results[0] as { attempted: number; imported: number }
  const row = latest.results[0] as { no: number } | undefined
  return { attempted, imported, lastNo: row?.no ?? null }
}

export async function studyReview(db: D1Database, userId: string, maxStage: StageLimit, beforeNo: number) {
  const { results } = await db.prepare(`
    SELECT q.no, q.stage FROM book_questions q
    WHERE q.stage <= ? AND q.no < ? AND (
      SELECT is_correct FROM study_attempts att
      WHERE att.user_id = ? AND att.kind = 'study' AND att.no = q.no
      ORDER BY occurred_at DESC, event_id DESC LIMIT 1
    ) = 0 ORDER BY q.no DESC LIMIT 51
  `).bind(maxStage, beforeNo, userId).all<{ no: number; stage: Stage }>()
  const questions = results.slice(0, 50)
  return { questions, next: results.length > 50 ? questions[49].no : null }
}

export async function importLegacyAttempts(db: D1Database, userId: string, maxStage: StageLimit, attempts: LegacyAttempt[], now: number) {
  const result = await db.batch(attempts.map(({ eventId, no, choice, at }) => db.prepare(`
    INSERT INTO study_attempts (user_id, event_id, kind, no, choice, occurred_at, received_at)
    SELECT ?, ?, 'legacy', no, ?, ?, ? FROM book_questions WHERE no = ? AND stage <= ?
    ON CONFLICT(user_id, kind, event_id) DO NOTHING RETURNING event_id
  `).bind(userId, eventId, choice, at, now, no, maxStage)))
  const imported = result.reduce((sum, row) => sum + row.results.length, 0)
  return { imported, skipped: attempts.length - imported }
}
