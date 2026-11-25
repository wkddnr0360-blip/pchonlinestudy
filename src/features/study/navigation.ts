import { validStage } from '../../app/stages'
import type { Stage } from '../../book/types'

export const reviewHref = '/study?view=review'

export function stageHref(stage: Stage) {
  return `/study?stage=${stage}`
}

export function stageFromQuery(params: URLSearchParams): Stage {
  const stage = params.get('stage') ?? undefined
  return validStage(stage) ? Number(stage) as Stage : 1
}

export function studyReturnFromQuery(params: URLSearchParams) {
  const target = params.get('study') ?? undefined
  return target === 'review' ? reviewHref : target === 'exam' ? '/exam' : validStage(target) ? stageHref(Number(target) as Stage) : null
}
