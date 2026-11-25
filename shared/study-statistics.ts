export const minimumPublicSample = 10
export const minimumDifficultySample = 30
export const difficultyLabels = ['매우 쉬움', '쉬움', '보통', '어려움', '매우 어려움'] as const
export const defaultDifficulty = [90, 75, 50, 30] as const
export type Difficulty = typeof difficultyLabels[number]
export type StatisticsStatus = 'collecting' | 'ready' | 'delayed' | 'paused' | 'metrics_unavailable'

export function accuracy(correct: number, total: number) {
  return total ? Math.round(correct * 1000 / total) / 10 : null
}

export function difficultyFor(correct: number, count: number, boundaries: readonly number[]): Difficulty | null {
  if (count < minimumDifficultySample) return null
  const level = boundaries.findIndex((cutoff) => correct * 100 >= cutoff * count)
  return difficultyLabels[level === -1 ? difficultyLabels.length - 1 : level]
}

export interface StudyStatistics {
  sample: number | null
  firstAccuracy: number | null
  wrongRate: number | null
  difficulty: Difficulty | null
  mine: { accuracy: number | null; wrong: number | null }
  calculatedAt: number | null
  delayed: boolean
  paused?: true
}

export interface StatisticsAdminPage {
  items: {
    no: number; stage: number; part: number; chapter: number; section: number | null; version: number; sample: number
    total: number; firstAccuracy: number | null; repeatAccuracy: number | null; selectedO: number | null
    meanSeconds: number | null; difficulty: Difficulty | null; flags: string[]
  }[]
  next: boolean
  totals: { attempts: number; firstCorrect: number; firstWrong: number; repeatCorrect: number; repeatWrong: number }
  budget: {
    status: StatisticsStatus; calculatedAt: number | null; observedAt: number | null; reads: number; writes: number
    accountReads: number | null; accountWrites: number | null; accountRequests: number | null
  }
  boundaries: number[]
  qualityPaused: boolean
}
