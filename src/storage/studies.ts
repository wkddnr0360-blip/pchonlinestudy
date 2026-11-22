import type { Ox, Question } from '../book/types'
import { db, type StudySession } from './db'

export function answerStudy(session: StudySession, question: Question, answer: Ox) {
  return db.transaction('rw', db.studies, db.attempts, db.reviews, async () => {
    const current = await db.studies.get(session.key)
    if (current?.id !== session.id) return
    const id = session.id + ':' + question.no
    if (await db.attempts.get(id)) return
    const at = Date.now()
    const correct = answer === question.answer
    await db.attempts.add({ id, sessionId: session.id, no: question.no, answer, correct, at })
    if (!correct) {
      await db.reviews.put({
        id: question.id, type: 'ox', no: question.no, chapterKey: question.chapterKey,
        stage: question.stage, at, resolved: false,
      })
    }
    await db.studies.update(session.key, { updatedAt: at })
    return correct
  })
}

export function moveStudy(session: StudySession, position: number) {
  return db.transaction('rw', db.studies, async () => {
    const current = await db.studies.get(session.key)
    if (current?.id === session.id && position >= 0 && position < current.numbers.length) {
      await db.studies.update(session.key, { position, updatedAt: Date.now() })
    }
  })
}
