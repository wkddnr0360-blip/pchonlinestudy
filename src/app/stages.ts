import type { Stage } from '../book/types'

export const stages = [
  { number: 1, name: '기본 다지기', label: '핵심 개념과 중요 지문', color: 'mint' },
  { number: 2, name: '실전 감각', label: '기출 지문으로 한 단계 더', color: 'blue' },
  { number: 3, name: '고득점 도전', label: '난도 높은 지문까지 마무리', color: 'lavender' },
] as const

export function validStage(value: string | undefined): value is '1' | '2' | '3' {
  return value === '1' || value === '2' || value === '3'
}

export function stagePresentation(stage: Stage) {
  return stages[stage - 1]
}
