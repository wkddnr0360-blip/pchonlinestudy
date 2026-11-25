import type { ExplanationBlock, Ox, Question, Stage } from '../src/book/types'

export interface StudyQuestion {
  id: string
  no: number
  stage: Stage
  revision: number
  prompt: string
  source: string
}

export interface StudyResult {
  correct: boolean
  answer: Ox
  marker: Question['marker']
  explanation: ExplanationBlock[]
}

export interface StudyProgress {
  attempted: number
  imported: number
  lastNo: number | null
}

export interface LegacyAttempt {
  eventId: string
  no: number
  choice: Ox
  at: number
}

export const legacyBatchSize = 50
export const legacyEventId = /^[a-zA-Z0-9:_-]{1,100}$/

export function questionId(no: number) {
  return `pch-ox-${no}`
}
