import type { Ox, Question } from '../../src/book/types'
import { correctOption, EXAM_COUNT, generateExam } from '../../src/exam/generate'
import type { MockExam, MockExamItem } from '../../shared/exam'

interface ExamRow { id: string; deadline: number; submittedAt: number | null }
interface SourceRow { no: number; revision: number; part: number; chapter: number; section: number | null; prompt: string; answer: Ox }

export async function expireExams(db: D1Database, userId: string, now: number) {
  await db.prepare('UPDATE mock_exams SET submitted_at = deadline WHERE user_id = ? AND submitted_at IS NULL AND deadline <= ?')
    .bind(userId, now).run()
}

async function summarize(db: D1Database, exam: ExamRow, now: number): Promise<MockExam> {
  const { results } = await db.prepare('SELECT response, response = correct_choice AS matched FROM mock_exam_items WHERE exam_id = ? ORDER BY position')
    .bind(exam.id).all<{ response: number | null; matched: number | null }>()
  return { ...exam, serverTime: now, responses: results.map(({ response }) => response),
    score: exam.submittedAt === null ? null : results.filter(({ matched }) => matched === 1).length }
}

export async function currentExam(db: D1Database, userId: string, now: number) {
  const row = await db.prepare(`
    SELECT id, deadline, submitted_at AS submittedAt FROM mock_exams
    WHERE user_id = ? ORDER BY submitted_at IS NOT NULL, started_at DESC, id LIMIT 1
  `).bind(userId).first<ExamRow>()
  return row && summarize(db, row, now)
}

export async function examById(db: D1Database, userId: string, id: string, now: number) {
  const row = await db.prepare('SELECT id, deadline, submitted_at AS submittedAt FROM mock_exams WHERE id = ? AND user_id = ?')
    .bind(id, userId).first<ExamRow>()
  return row && summarize(db, row, now)
}

export async function startExam(db: D1Database, userId: string, minutes: number) {
  const { results } = await db.prepare(`
    SELECT q.no, rev.revision, q.part, q.chapter, q.section, rev.prompt, rev.answer
    FROM book_questions q JOIN question_revisions rev ON rev.no = q.no AND rev.revision = q.active_revision
    ORDER BY q.no
  `).all<SourceRow>()
  if (results.length < EXAM_COUNT * 4) return null
  let items
  try { items = generateExam(results) } catch { return null }
  const id = crypto.randomUUID()
  const now = Date.now()
  try {
    await db.batch([
      db.prepare('INSERT INTO mock_exams (id, user_id, started_at, deadline) VALUES (?, ?, ?, ?)').bind(id, userId, now, now + minutes * 60_000),
      ...items.map((item, index) => db.prepare(`
        INSERT INTO mock_exam_items (exam_id, position, target, options, correct_choice) VALUES (?, ?, ?, ?, ?)
      `).bind(id, index + 1, item.target, JSON.stringify(item.options.map(({ no, revision }) => ({ no, revision }))), correctOption(item))),
    ])
  } catch (error) {
    const active = await currentExam(db, userId, now)
    if (active && active.submittedAt === null) return active
    throw error
  }
  return examById(db, userId, id, now)
}

export async function examItem(db: D1Database, userId: string, id: string, position: number): Promise<MockExamItem | null> {
  const { results } = await db.prepare(`
    SELECT i.target, i.response AS choice, i.response_version AS version, r.prompt,
      CASE WHEN e.submitted_at IS NOT NULL THEN i.correct_choice END AS correctChoice,
      CASE WHEN e.submitted_at IS NOT NULL THEN r.no END AS no,
      CASE WHEN e.submitted_at IS NOT NULL THEN r.source END AS source,
      CASE WHEN e.submitted_at IS NOT NULL THEN r.answer END AS answer,
      CASE WHEN e.submitted_at IS NOT NULL THEN r.marker END AS marker,
      CASE WHEN e.submitted_at IS NOT NULL THEN r.explanation END AS explanation
    FROM mock_exams e JOIN mock_exam_items i ON i.exam_id = e.id
    JOIN json_each(i.options) opt
    JOIN question_revisions r ON r.no = json_extract(opt.value, '$.no') AND r.revision = json_extract(opt.value, '$.revision')
    WHERE e.user_id = ? AND e.id = ? AND i.position = ? ORDER BY CAST(opt.key AS INTEGER)
  `).bind(userId, id, position).all<{
    target: Ox; choice: number | null; version: number; prompt: string;
    correctChoice: number | null; no: number | null; source: string | null;
    answer: Ox | null; marker: Question['marker'] | null; explanation: string | null
  }>()
  if (results.length !== 4) return null
  const { target, choice, version, correctChoice } = results[0]
  return { position, target, choice, version, options: results.map(({ prompt }) => ({ prompt })),
    ...(correctChoice !== null ? { review: { correctChoice, options: results.map(({ no, source, answer, marker, explanation }) => ({
      no: no!, source: source!, answer: answer!, marker: marker!, explanation: JSON.parse(explanation!),
    })) } } : {}) }
}

export async function saveExamChoice(db: D1Database, userId: string, id: string, position: number, choice: number, version: number, now: number) {
  return db.prepare(`
    UPDATE mock_exam_items SET response = ?, response_version = response_version + 1
    WHERE exam_id = ? AND position = ? AND response_version = ? AND EXISTS (
      SELECT 1 FROM mock_exams WHERE id = ? AND user_id = ? AND submitted_at IS NULL AND deadline > ?
    ) RETURNING response AS choice, response_version AS version
  `).bind(choice, id, position, version, id, userId, now).first<{ choice: number; version: number }>()
}

export async function submitExam(db: D1Database, userId: string, id: string, now: number) {
  await db.prepare(`
    UPDATE mock_exams SET submitted_at = MIN(deadline, MAX(started_at, ?))
    WHERE id = ? AND user_id = ? AND submitted_at IS NULL
  `).bind(now, id, userId).run()
  return examById(db, userId, id, now)
}
