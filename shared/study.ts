import type { ExplanationBlock, Ox, Question, Stage } from '../src/book/types'
import type { StudyStatistics } from './study-statistics'

export interface StudyCatalog {
  questions: StudyIndexEntry[]
  outline: StudyOutlineLabel[]
  access: { bookVerified: boolean }
  recommendationsAvailable?: boolean
}

export interface StudyIndexEntry {
  no: number
  stage: Stage
  part: number
  chapter: number
  section: number | null
}

export interface StudyOutlineLabel {
  stage: Stage
  part: number
  chapter: number
  section: number
  label: string
  printedPage: number | null
}

export interface StudyQuestion {
  id: string
  no: number
  stage: Stage
  revision: number
  prompt: string
  source: string
  statisticsContext?: { eventId: string; proof: string }
}

export interface StudyResult {
  correct: boolean
  answer: Ox
  marker: Question['marker']
  explanation: ExplanationBlock[]
  statistics?: StudyStatistics
}

export interface StudyProgress {
  attempted: number
  imported: number
  lastNo: number | null
}

export function questionId(no: number) {
  return `pch-ox-${no}`
}
