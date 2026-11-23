import type { BookIndex, Question } from '../book/types'
import { shuffle } from '../study/selection'

export const stageGoal = 5
export const startingLives = 3

export interface Progress {
  stage: number
  stageCorrect: number
  correct: number
  streak: number
  lives: number
}

export const initialProgress: Progress = {
  stage: 1, stageCorrect: 0, correct: 0, streak: 0, lives: startingLives,
}

export function grade(progress: Progress, correct: boolean) {
  const streak = correct ? progress.streak + 1 : 0
  const stageCorrect = progress.stageCorrect + (correct ? 1 : 0)
  const cleared = stageCorrect === stageGoal
  const bonus = streak > 0 && streak % 3 === 0 ? 2000 : 0
  return {
    cleared, bonus,
    next: {
      stage: progress.stage + (cleared ? 1 : 0),
      stageCorrect: cleared ? 0 : stageCorrect,
      correct: progress.correct + (correct ? 1 : 0),
      lives: progress.lives - (correct ? 0 : 1),
      streak,
    },
  }
}

export function questionTime(question: Question, stage: number, bonus = 0) {
  const pacing = Math.max(9000, 24000 - (stage - 1) * 1750)
  const reading = Math.min(16000, Math.max(0, question.prompt.length - 110) * 36)
  return pacing + reading + bonus
}

export const themes = [
  { label: '햇살 서재', name: 'day', number: 1 },
  { label: '보랏빛 기록관', name: 'dusk', number: 2 },
  { label: '별빛 서재', name: 'night', number: 3 },
] as const

export function themeFor(stage: number) {
  return themes[(stage - 1) % themes.length]
}

export function challengeScopes(book: BookIndex) {
  return book.stages.find(({ stage }) => stage === 2)?.parts.flatMap((part) => part.chapters.map((chapter) => ({
    key: part.number + '-' + chapter.number, label: chapter.label, part: part.label,
  }))) ?? []
}

export function questionDraw(questions: Question[], random = Math.random) {
  const intermediate = questions.filter(({ stage }) => stage === 2)
  const advanced = questions.filter(({ stage }) => stage === 3)
  let normalDeck = shuffle(intermediate, random)
  let hardDeck = shuffle(advanced, random)
  return (stage: number): Question | undefined => {
    if (!normalDeck.length && !hardDeck.length) {
      normalDeck = shuffle(intermediate, random)
      hardDeck = shuffle(advanced, random)
    }
    const hardChance = Math.min(.84, .21 + (stage - 1) * .085)
    return random() < hardChance ? hardDeck.pop() ?? normalDeck.pop() : normalDeck.pop() ?? hardDeck.pop()
  }
}
