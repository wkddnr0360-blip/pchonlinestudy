export type Stage = 1 | 2 | 3
export type Ox = 'O' | 'X'

export interface Section {
  number: number
  label: string
  page: number
  count: number
}
export interface Chapter extends Section {
  key: string
  sections: Section[]
}
export interface Part extends Section {
  chapters: Chapter[]
}
export interface StageIndex {
  stage: Stage
  parts: Part[]
}
export interface BookIndex {
  edition: string
  version: string
  sha256: string
  count: number
  stages: StageIndex[]
}
export type ExplanationBlock =
  | { kind: 'text'; text: string }
  | { kind: 'table'; rows: { text: string; colSpan: number; rowSpan: number }[][] }

export interface Question {
  id: string
  no: number
  stage: Stage
  part: number
  chapter: number
  section: number | null
  chapterKey: string
  prompt: string
  source: string
  answer: Ox
  marker: '[○]' | '[×]' | '[X]'
  explanation: ExplanationBlock[]
  questionIndex: number
  answerIndex: number
}

export interface Scope {
  stage: Stage
  chapterKey?: string
  part?: number
  section?: number
}
