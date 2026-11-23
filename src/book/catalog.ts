import type { BookIndex, Question, Scope } from './types'
import { isStageOpen, limitBookIndex } from './publicPreview'

let index: Promise<BookIndex> | undefined
const chunks = new Map<string, Promise<Question[]>>()
const root = import.meta.env.BASE_URL + 'book/'

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(root + path)
  if (!response.ok) throw new Error('교재 데이터를 불러오지 못했습니다.')
  return response.json() as Promise<T>
}

export function getBookIndex() {
  index ??= readJson<BookIndex>('manifest.json').then(limitBookIndex).catch((error: unknown) => {
    index = undefined
    throw error
  })
  return index
}

export function getChapter(index: BookIndex, key: string) {
  if (!isStageOpen(Number(key.split('-')[0]))) return Promise.reject(new Error('잠긴 학습 범위입니다.'))
  if (!chunks.has(key)) {
    const request = readJson<Question[]>(index.version + '/' + key + '.json').catch((error: unknown) => {
      chunks.delete(key)
      throw error
    })
    chunks.set(key, request)
  }
  return chunks.get(key)!
}

export async function getQuestions(index: BookIndex, scope?: Scope) {
  const chapters = index.stages
    .filter(({ stage }) => isStageOpen(stage) && (!scope || stage === scope.stage))
    .flatMap((stage) => stage.parts.filter((part) => !scope?.part || part.number === scope.part))
    .flatMap((part) => part.chapters)
    .filter((chapter) => !scope?.chapterKey || chapter.key === scope.chapterKey)
  const questions = (await Promise.all(chapters.map((chapter) => getChapter(index, chapter.key)))).flat()
  return questions.filter((question) => !scope?.section || question.section === scope.section)
}
