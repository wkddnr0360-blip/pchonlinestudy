import type { Ox, Question } from '../src/book/types'

export interface MockExam {
  id: string
  deadline: number
  submittedAt: number | null
  serverTime: number
  responses: (number | null)[]
  score: number | null
}

export interface MockExamItem {
  position: number
  target: Ox
  options: { prompt: string }[]
  choice: number | null
  version: number
  review?: {
    correctChoice: number
    options: Pick<Question, 'no' | 'source' | 'answer' | 'marker' | 'explanation'>[]
  }
}
