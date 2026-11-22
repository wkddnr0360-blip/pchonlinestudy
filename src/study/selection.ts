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
