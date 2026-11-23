import type { ExamSession } from '../storage/db'
import type { BookIndex } from './types'

export const publicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === '1'

export function isStageOpen(stage: number) {
  return !publicPreview || stage === 1
}

export function limitBookIndex(book: BookIndex): BookIndex {
  if (!publicPreview) return book
  const stages = book.stages.filter(({ stage }) => isStageOpen(stage))
  const count = stages.reduce((sum, stage) => sum + stage.parts.reduce((total, part) => total + part.count, 0), 0)
  return { ...book, stages, count }
}

export function isFirstStageExam(exam: Pick<ExamSession, 'questions'>) {
  return exam.questions.every(({ options }) => options.every(({ stage }) => stage === 1))
}

export function isExamOpen(exam: Pick<ExamSession, 'questions'>) {
  return !publicPreview || isFirstStageExam(exam)
}
