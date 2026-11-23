import { z } from 'zod'
import { isFirstStageExam } from '../book/publicPreview'
import { EXAM_COUNT, correctOption } from '../exam/generate'
import { db } from './db'

const number = z.number().int().positive()
const timestamp = z.number().int().nonnegative()
const stage = z.union([z.literal(1), z.literal(2), z.literal(3)])
const ox = z.enum(['O', 'X'])
const bookNo = number.max(3129)
const chapterKey = z.string().regex(/^[1-3]-[12]-[1-7]$/)
const version = z.string().regex(/^[a-f0-9]{16}$/)
const examPosition = z.number().int().min(0).max(EXAM_COUNT - 1)
const answer = z.number().int().min(0).max(3)
const cell = z.object({ text: z.string(), colSpan: number, rowSpan: number })
const explanation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({ kind: z.literal('table'), rows: z.array(z.array(cell)) }),
])
const question = z.object({
  id: z.string(), no: bookNo, stage, part: number, chapter: number, section: number.nullable(), chapterKey,
  prompt: z.string().min(1), source: z.string().min(1), answer: ox,
  marker: z.enum(['[○]', '[×]', '[X]']), explanation: z.array(explanation).min(1),
  questionIndex: timestamp, answerIndex: timestamp,
})
const examQuestion = z.object({
  target: ox, options: z.tuple([question, question, question, question]),
}).refine(({ target, options }) => options.filter((option) => option.answer === target).length === 1)

const backupSchema = z.object({
  format: z.literal('police-constitution-ox'),
  schemaVersion: z.literal(1),
  exportedAt: timestamp,
  studies: z.array(z.object({
    key: z.string().min(1), id: z.uuid(), scope: z.object({ stage, chapterKey: chapterKey.optional(), part: number.optional(), section: number.optional() }),
    mode: z.enum(['order', 'random']), version, numbers: z.array(bookNo).min(1), position: timestamp, updatedAt: timestamp,
  }).refine((study) => study.position < study.numbers.length)),
  attempts: z.array(z.object({ id: z.string(), sessionId: z.uuid(), no: bookNo, answer: ox, correct: z.boolean(), at: timestamp })),
  exams: z.array(z.object({
    id: z.uuid(), version, status: z.enum(['active', 'submitted']),
    questions: z.array(examQuestion).length(EXAM_COUNT), responses: z.array(answer.nullable()).length(EXAM_COUNT),
    position: examPosition, startedAt: timestamp, deadline: timestamp, submittedAt: timestamp.optional(),
  }).refine((exam) => exam.deadline > exam.startedAt && (exam.status === 'active' || !!exam.submittedAt))),
  reviews: z.array(z.object({
    id: z.string(), type: z.enum(['ox', 'exam']), no: bookNo, chapterKey, stage,
    examId: z.uuid().optional(), examPosition: examPosition.optional(), at: timestamp, resolved: z.boolean(),
  })),
  settings: z.array(z.object({ key: z.enum(['patchRead', 'releaseSeen', 'feedback']), value: z.string() })),
  challengeScores: z.array(z.object({
    scope: z.string().regex(/^(all|[12]-[1-7])$/), cleared: timestamp, correct: timestamp, at: timestamp,
  })).default([]),
})

const tables = [db.studies, db.attempts, db.exams, db.reviews, db.settings, db.challengeScores]

export type Backup = z.infer<typeof backupSchema>

export function readBackup(value: unknown): Backup {
  const parsed = backupSchema.safeParse(value)
  if (!parsed.success) throw new Error('이 앱의 백업 형식과 맞지 않거나 파일이 손상되었습니다.')
  const backup = parsed.data
  const active = backup.exams.filter((exam) => exam.status === 'active')
  const activeScopes = new Set(active.map(isFirstStageExam))
  if (active.length !== activeScopes.size) throw new Error('진행 중인 시험 기록이 중복됩니다.')
  const exams = new Map(backup.exams.map((exam) => [exam.id, exam]))
  for (const review of backup.reviews) {
    if (review.type !== 'exam') continue
    const exam = exams.get(review.examId ?? '')
    const question = exam?.questions[review.examPosition ?? -1]
    if (exam?.status !== 'submitted' || !question || question.options[correctOption(question)].no !== review.no) {
      throw new Error('오답과 연결된 시험 기록이 없습니다.')
    }
  }
  return backup
}

export async function exportBackup(): Promise<Backup> {
  return db.transaction('r', tables, async () => ({
    format: 'police-constitution-ox', schemaVersion: 1, exportedAt: Date.now(),
    studies: await db.studies.toArray(), attempts: await db.attempts.toArray(), exams: await db.exams.toArray(),
    reviews: await db.reviews.toArray(), settings: await db.settings.toArray(),
    challengeScores: await db.challengeScores.toArray(),
  }))
}

export async function restoreBackup(backup: Backup) {
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()))
    await db.studies.bulkAdd(backup.studies)
    await db.attempts.bulkAdd(backup.attempts)
    await db.exams.bulkAdd(backup.exams)
    await db.reviews.bulkAdd(backup.reviews)
    await db.settings.bulkAdd(backup.settings)
    await db.challengeScores.bulkAdd(backup.challengeScores)
  })
}
