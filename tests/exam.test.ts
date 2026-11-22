import { expect, test } from 'vitest'
import { correctOption, generateExam } from '../src/exam/generate'
import { questions, seeded } from './fixtures'

test('exam respects the actual book blueprint and preserves all option fields', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const exam = generateExam(questions, seeded(seed))
    expect(exam).toHaveLength(20)
    expect(exam.filter((question) => question.options[0].part === 1)).toHaveLength(4)
    expect(exam.filter((question) => question.target === 'O')).toHaveLength(10)
    const all = exam.flatMap((question) => question.options.map((option) => option.prompt.replace(/\s/g, '')))
    expect(new Set(all).size).toBe(80)
    for (const question of exam) {
      expect(question.options).toHaveLength(4)
      expect(question.options.filter((option) => option.answer === question.target)).toHaveLength(1)
      expect(question.options[correctOption(question)].answer).toBe(question.target)
      expect(new Set(question.options.map((option) => option.part + '-' + option.chapter)).size).toBe(1)
      for (const option of question.options) expect(option).toBe(questions[option.no - 1])
    }
  }
})

test('an insufficient pool fails atomically', () => {
  expect(() => generateExam(questions.slice(0, 4), seeded(1))).toThrow()
})
