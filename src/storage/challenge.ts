import type { Ox, Question } from '../book/types'
import { db, type ChallengeScore } from './db'
import { makeOxReview } from './reviews'

export async function recordChallengeAnswer(id: string, turn: number, question: Question, answer: Ox | null) {
  await db.transaction('rw', db.attempts, db.reviews, async () => {
    const at = Date.now()
    const correct = answer === question.answer
    if (answer !== null) await db.attempts.add({ id: id + ':' + turn, sessionId: id, no: question.no, answer, correct, at })
    if (!correct) await db.reviews.put(makeOxReview(question, at))
  })
}

export async function storeBestScore(candidate: ChallengeScore) {
  return db.transaction('rw', db.challengeScores, async () => {
    const previous = await db.challengeScores.get(candidate.scope)
    if (previous && (previous.cleared > candidate.cleared
      || (previous.cleared === candidate.cleared && previous.correct >= candidate.correct))) return false
    await db.challengeScores.put(candidate)
    return true
  })
}
