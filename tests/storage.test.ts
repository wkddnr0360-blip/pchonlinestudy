import 'fake-indexeddb/auto'
import { afterEach, expect, test } from 'vitest'
import { correctOption, generateExam } from '../src/exam/generate'
import { exportBackup, readBackup, restoreBackup } from '../src/storage/backup'
import { db } from '../src/storage/db'
import { changeExam, startExam, submitExam } from '../src/storage/exams'
import { answerStudy } from '../src/storage/studies'
import { book, questions, seeded } from './fixtures'

afterEach(async () => {
  for (const table of db.tables) await table.clear()
})

test('late answers are ignored and a concurrent submission records each missed question once', async () => {
  const draw = generateExam(questions, seeded(17))
  const start = 100_000
  const [exam, duplicate] = await Promise.all([startExam(draw, 1, book.version, start), startExam(draw, 1, book.version, start)])
  expect(exam.id).toBe(duplicate.id)
  await changeExam(exam.id, 0, correctOption(draw[0]), start + 1000)
  await changeExam(exam.id, 1, 0, start + 60000)
  const [saved] = await Promise.all([submitExam(exam.id, start + 70000), submitExam(exam.id, start + 70000)])
  expect(saved?.responses[1]).toBeNull()
  expect(saved?.submittedAt).toBe(start + 60000)
  expect(await db.reviews.count()).toBe(19)
})

test('OX answers persist and backup restoration is atomic', async () => {
  const study = {
    key: '1/all/all/all', id: crypto.randomUUID(), scope: { stage: 1 as const }, mode: 'order' as const,
    version: book.version, numbers: [1], position: 0, updatedAt: 100,
  }
  await db.studies.add(study)
  const question = questions[0]
  await answerStudy(study, question, question.answer === 'O' ? 'X' : 'O')
  const before = readBackup(await exportBackup())
  expect(before.attempts).toHaveLength(1)
  expect(before.reviews).toHaveLength(1)
  const invalid = { ...before, studies: [study, study] }
  await expect(restoreBackup(invalid)).rejects.toThrow()
  expect(await db.attempts.count()).toBe(1)
  await db.reviews.clear()
  await restoreBackup(before)
  expect(await db.reviews.count()).toBe(1)
  expect(() => readBackup({ ...before, schemaVersion: 0 })).toThrow()
})
