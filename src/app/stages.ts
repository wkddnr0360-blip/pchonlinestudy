import type { Stage } from '../book/types'

export const stages = [
  { number: 1, name: '기본 다지기', label: '이 정도는 가볍게 풀리네요!', color: 'mint' },
  { number: 2, name: '실전 감각', label: '오, 이제 실전 감이 오네요!', color: 'blue' },
  { number: 3, name: '고득점 도전', label: '잠깐, 이 어려운 것도 풀리는데요?!', color: 'lavender' },
] as const

export function validStage(value: string | undefined): value is '1' | '2' | '3' {
  return value === '1' || value === '2' || value === '3'
}

export function stagePresentation(stage: Stage) {
  return stages[stage - 1]
}
