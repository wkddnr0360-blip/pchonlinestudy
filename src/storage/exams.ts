import { isExamOpen } from '../book/publicPreview'
import { correctOption, type ExamQuestion } from '../exam/generate'
import { db, type ExamSession, type ReviewItem } from './db'
import { makeOxReview } from './reviews'

export async function activeExam() {
  return db.exams.where('status').equals('active').filter(isExamOpen).first()
}

export async function startExam(questions: ExamQuestion[], minutes: number, version: string, now = Date.now()) {
  return db.transaction('rw', db.exams, async () => {
    const existing = await activeExam()
    if (existing) return existing
    const exam: ExamSession = {
      id: crypto.randomUUID(), version, status: 'active', questions,
      responses: questions.map(() => null), position: 0, startedAt: now, deadline: now + minutes * 60000,
    }
    await db.exams.add(exam)
    return exam
  })
}

export async function changeExam(id: string, position: number, choice?: number, now = Date.now()) {
  return db.transaction('rw', db.exams, async () => {
    const exam = await db.exams.get(id)
    if (!exam || exam.status !== 'active' || now >= exam.deadline) return
    if (!exam.questions[position]) return
    const responses = [...exam.responses]
    if (choice !== undefined && choice >= 0 && choice <= 3) responses[position] = choice
    await db.exams.update(id, { position, responses })
  })
}

export async function submitExam(id: string, now = Date.now()) {
  return db.transaction('rw', db.exams, db.reviews, async () => {
    const exam = await db.exams.get(id)
    if (!exam || exam.status === 'submitted') return exam
    const reviews: ReviewItem[] = []
    exam.questions.forEach((question, position) => {
      const correct = correctOption(question)
      if (exam.responses[position] === correct) return
      reviews.push(makeOxReview(question.options[correct], Math.min(now, exam.deadline)))
    })
    const updated = { ...exam, status: 'submitted' as const, submittedAt: Math.min(now, exam.deadline) }
    await db.exams.put(updated)
    await db.reviews.bulkPut(reviews)
    return updated
  })
}
