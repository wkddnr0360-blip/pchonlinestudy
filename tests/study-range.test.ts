import { expect, test } from 'vitest'
import { selectNumberRange } from '../src/study/selection'

test('selects printed question numbers, inclusive and ordered', () => {
  expect(selectNumberRange([505, 509, 507, 506], 506, 509)).toEqual([506, 507, 509])
  expect(selectNumberRange([505, 507, 509], 507, 507)).toEqual([507])
  expect(selectNumberRange([1, 2, 2, 3], 1, 3)).toEqual([1, 2, 3])
})

test('rejects invalid, out of scope and empty ranges', () => {
  for (const [first, last] of [[0, 505], [505, 510], [509, 505], [505.5, 509], [506, 506], [NaN, 509]]) {
    expect(() => selectNumberRange([505, 507, 509], first, last)).toThrow(RangeError)
  }
  expect(() => selectNumberRange([], 1, 1)).toThrow(RangeError)
})
