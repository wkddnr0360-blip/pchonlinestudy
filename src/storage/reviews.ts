import type { Question } from '../book/types'
import type { ReviewItem } from './db'

export function makeOxReview(question: Question, at: number): ReviewItem {
  return {
    id: question.id, type: 'ox', no: question.no, chapterKey: question.chapterKey,
    stage: question.stage, at, resolved: false,
  }
}

export function unifyReviews(items: ReviewItem[]) {
  const byNumber = new Map<number, ReviewItem>()
  for (const item of items) {
    const previous = byNumber.get(item.no)
    if (!previous || item.at > previous.at || (item.at === previous.at && !item.resolved)) {
      byNumber.set(item.no, {
        id: 'pch-ox-' + item.no, type: 'ox', no: item.no, stage: item.stage,
        chapterKey: item.chapterKey, at: item.at, resolved: item.resolved,
      })
    }
  }
  return [...byNumber.values()]
}
