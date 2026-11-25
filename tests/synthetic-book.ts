import type { BookIndex, Chapter, Part, Question, StageIndex } from '../src/book/types'

const editionHash = 'f'.repeat(64)
const edition = [
  { stage: 1, first: 1, last: 504 },
  { stage: 2, first: 505, last: 1859 },
  { stage: 3, first: 1860, last: 3129 },
] as const

export function createSyntheticBook() {
  const questions: Question[] = []
  const stages: StageIndex[] = edition.map(({ stage, first, last }) => {
    const parts: Part[] = [
      { number: 1, label: '제1편 헌법총론', page: 1, count: 0, chapters: [] },
      { number: 2, label: '제2편 기본권론', page: 1, count: 0, chapters: [] },
    ]
    const ranges = [
      { part: parts[0], number: 1, label: '제1장 헌법의 개념과 헌법학', start: first, end: first + 20 },
      { part: parts[0], number: 2, label: '제2장 대한민국헌법 총설', start: first + 21, end: first + 95 },
      { part: parts[1], number: 1, label: '제1장 합성 기본권 문항', start: first + 96, end: last },
    ]
    for (const { part, number, label, start, end } of ranges) {
      const count = end - start + 1
      const chapter: Chapter = {
        number, label, page: 1, count, key: `${stage}-${part.number}-${number}`,
        sections: [{ number: 1, label: '합성 검증 범위', page: 1, count }],
      }
      part.count += count
      part.chapters.push(chapter)
      for (let no = start; no <= end; no++) {
        const answer = no % 2 === 0 ? 'X' : 'O'
        questions.push({
          id: `fixture-ox-${no}`, no, stage, part: part.number, chapter: number, chapterKey: chapter.key,
          section: 1, questionIndex: no, answerIndex: no + 3129, answer, marker: answer === 'O' ? '[○]' : '[×]',
          prompt: `자동 테스트용 합성 지문 ${no}.`, source: '합성 데이터',
          explanation: [{ kind: 'text', text: `테스트용 해설 ${no}.` }],
        })
      }
    }
    return { stage, parts }
  })
  const book: BookIndex = { edition: '합성 테스트 교재', sha256: editionHash, version: editionHash.slice(0, 16), count: questions.length, stages }
  return { book, questions }
}
