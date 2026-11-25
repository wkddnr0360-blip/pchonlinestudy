import { expect, test } from 'vitest'
import { createSyntheticBook } from './synthetic-book'

test('the synthetic fixture matches the numbered stage and OX structure', () => {
  const { book, questions } = createSyntheticBook()
  expect(questions.map(({ no }) => no)).toEqual(Array.from({ length: book.count }, (_, index) => index + 1))
  expect(new Set(questions.map(({ id }) => id)).size).toBe(book.count)
  expect(book.stages.map(({ parts }) => parts.reduce((sum, part) => sum + part.count, 0))).toEqual([504, 1355, 1270])
  expect(questions.every(({ id, source }) => id.startsWith('fixture-ox-') && source === '합성 데이터')).toBe(true)
})
