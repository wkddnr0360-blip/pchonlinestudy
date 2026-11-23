import 'fake-indexeddb/auto'
import { afterEach, expect, test } from 'vitest'
import { generateExam } from '../src/exam/generate'
import { grade, initialProgress, questionDraw, questionTime, stageGoal } from '../src/challenge/rules'
import { storeBestScore } from '../src/storage/challenge'
import { db } from '../src/storage/db'
import { unifyReviews } from '../src/storage/reviews'
import { questions, seeded } from './fixtures'

afterEach(async () => { await db.challengeScores.clear() })

test('the question deck uses stages two and three only, without repetitions until exhausted', () => {
  const pool = [questions[0], questions[504], questions[505], questions[1859]]
  const draw = questionDraw(pool, seeded(18))
  expect(new Set(Array.from({ length: 3 }, () => draw(1)?.no))).toEqual(new Set([505, 506, 1860]))
  expect(draw(2)?.stage).not.toBe(1)
  expect(questionDraw(pool, () => .3)(1)?.stage).toBe(2)
  expect(questionDraw(pool, () => .3)(9)?.stage).toBe(3)
})

test('stage clears, combos and countdowns increase difficulty at a readable pace', () => {
  let progress = initialProgress
  for (let index = 1; index <= stageGoal; index++) {
    const result = grade(progress, true)
    expect(result.cleared).toBe(index === stageGoal)
    expect(result.bonus).toBe(index === 3 ? 2000 : 0)
    progress = result.next
  }
  expect(progress.stage).toBe(2)
  expect(progress.stageCorrect).toBe(0)
  const miss = grade(progress, false).next
  expect(miss.lives).toBe(2)
  expect(miss.streak).toBe(0)
  const short = { ...questions[504], prompt: '교재 지문' }
  expect(questionTime(short, 8)).toBeLessThan(questionTime(short, 1))
  expect(questionTime(short, 99)).toBe(9000)
  expect(questionTime({ ...short, prompt: '교재 문장 '.repeat(80) }, 99)).toBeGreaterThan(9000)
})

test('local best remains highest per scope, including simultaneous finishes', async () => {
  await Promise.all([
    storeBestScore({ scope: 'all', cleared: 8, correct: 41, at: 2 }),
    storeBestScore({ scope: 'all', cleared: 7, correct: 39, at: 3 }),
    storeBestScore({ scope: '1-1', cleared: 1, correct: 7, at: 3 }),
  ])
  expect((await db.challengeScores.get('all'))?.cleared).toBe(8)
  expect((await db.challengeScores.get('1-1'))?.cleared).toBe(1)
})

test('old mock records and OX answers with the same textbook number appear once', () => {
  const base = { no: 1894, chapterKey: '3-1-1', stage: 3 as const }
  const rows = unifyReviews([
    { ...base, id: 'mock:8', type: 'exam', examPosition: 7, at: 20, resolved: false },
    { ...base, id: 'pch-ox-1894', type: 'ox', at: 10, resolved: true },
  ])
  expect(rows).toEqual([{ ...base, id: 'pch-ox-1894', type: 'ox', at: 20, resolved: false }])
})

test('the 504 stage one questions can support the entire mock exam blueprint', () => {
  const firstStage = questions.filter((question) => question.stage === 1)
  for (let seed = 1; seed <= 25; seed++) {
    const exam = generateExam(firstStage, seeded(seed))
    expect(exam).toHaveLength(20)
    expect(exam.filter((question) => question.options[0].part === 1)).toHaveLength(4)
    expect(exam.every((question) => question.options.every((option) => option.stage === 1))).toBe(true)
  }
})
