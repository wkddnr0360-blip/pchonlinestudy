export function shuffle<T>(values: readonly T[], random = Math.random): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    const value = result[index]
    result[index] = result[swap]
    result[swap] = value
  }
  return result
}

export function scopeKey(stage: number, part?: number, chapter?: string, section?: number) {
  return [stage, part ?? 'all', chapter ?? 'all', section ?? 'all'].join('/')
}

/** Select the actual printed question numbers (not relative positions in a chapter). */
export function selectNumberRange(numbers: readonly number[], first: number, last: number): number[] {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || first > last || !numbers.length) {
    throw new RangeError('Invalid question number range')
  }
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  if (first < sorted[0] || last > sorted[sorted.length - 1]) throw new RangeError('Range outside scope')
  const selected = sorted.filter((no) => no >= first && no <= last)
  if (!selected.length) throw new RangeError('No questions in range')
  return selected
}
