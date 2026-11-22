import type { Ox, Question } from '../book/types'
import { shuffle } from '../study/selection'

export interface ExamQuestion {
  target: Ox
  options: [Question, Question, Question, Question]
}
export const EXAM_COUNT = 20
export const DEFAULT_MINUTES = 20

const blueprint = [
  ...Array.from({ length: 2 }, () => ({ part: 1, target: 'O' as const })),
  ...Array.from({ length: 2 }, () => ({ part: 1, target: 'X' as const })),
  ...Array.from({ length: 8 }, () => ({ part: 2, target: 'O' as const })),
  ...Array.from({ length: 8 }, () => ({ part: 2, target: 'X' as const })),
]
const contentKey = (question: Question) => question.prompt.replace(/\s/g, '')

function indexTopics(questions: Question[]) {
  const answers = new Map<string, Ox>()
  const ambiguous = new Set<string>()
  for (const question of questions) {
    const key = contentKey(question)
    if (answers.has(key) && answers.get(key) !== question.answer) ambiguous.add(key)
    answers.set(key, question.answer)
  }
  const leaf = new Map<string, Question[]>()
  const chapters = new Map<string, Question[]>()
  for (const question of questions) {
    if (ambiguous.has(contentKey(question))) continue
    const key = question.part + '-' + question.chapter
    const topic = key + '-' + (question.section ?? 'chapter')
    leaf.set(topic, [...(leaf.get(topic) ?? []), question])
    chapters.set(key, [...(chapters.get(key) ?? []), question])
  }
  return { leaf: [...leaf.values()], chapters: [...chapters.values()] }
}

function chooseFrom(
  groups: Question[][], part: number, target: Ox, used: Set<string>, random: () => number,
) {
  for (const group of shuffle(groups.filter((group) => group[0].part === part), random)) {
    const available = new Map<string, Question>()
    for (const question of shuffle(group, random)) {
      const key = contentKey(question)
      if (!used.has(key)) available.set(key, question)
    }
    const choices = [...available.values()]
    const correct = choices.find((question) => question.answer === target)
    const distractors = choices.filter((question) => question.answer !== target).slice(0, 3)
    if (correct && distractors.length === 3) return [correct, ...distractors]
  }
}

export function generateExam(questions: Question[], random = Math.random): ExamQuestion[] {
  const topics = indexTopics(questions)
  for (let attempt = 0; attempt < 8; attempt++) {
    const used = new Set<string>()
    const exam: ExamQuestion[] = []
    for (const { part, target } of shuffle(blueprint, random)) {
      const options = chooseFrom(topics.leaf, part, target, used, random)
        ?? chooseFrom(topics.chapters, part, target, used, random)
      if (!options) break
      options.forEach((question) => used.add(contentKey(question)))
      exam.push({ target, options: shuffle(options, random) as ExamQuestion['options'] })
    }
    if (exam.length === EXAM_COUNT) return exam
  }
  throw new Error('조건에 맞는 20문항을 구성할 수 없습니다. 잠시 후 다시 시도해 주세요.')
}

export function correctOption(question: ExamQuestion) {
  return question.options.findIndex((option) => option.answer === question.target)
}
