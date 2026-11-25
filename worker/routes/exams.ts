import { EXAM_COUNT } from '../../src/exam/generate'
import { json, readSmallJson } from '../http'
import { readMemberAccess } from '../services/book-access'
import { currentExam, examById, examItem, expireExams, saveExamChoice, startExam, submitExam } from '../services/exams'
import { withinStudyLimit } from '../services/study'

export const examPrefix = '/api/v1/exam/'
const routePattern = /^([a-f0-9-]{36})(?:\/(submit|item(?:\/([1-9][0-9]?))))?$/

export async function examRoute(request: Request, db: D1Database, url: URL, userId: string) {
  const { method } = request
  const path = url.pathname.slice(examPrefix.length)
  const now = Date.now()
  if (!(await readMemberAccess(db, userId, now)).bookVerified) return json({ error: 'book_required' }, 403, method)
  await expireExams(db, userId, now)
  if (method === 'GET' && path === 'current') return json({ exam: await currentExam(db, userId, now) }, 200)
  if (method === 'POST' && path === 'start') {
    const input = await readSmallJson(request) as { minutes?: number } | null
    const minutes = input?.minutes
    if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 180) return json({ error: 'invalid_input' }, 400)
    const existing = await currentExam(db, userId, now)
    if (existing && existing.submittedAt === null) return json({ exam: existing }, 200)
    if (!await withinStudyLimit(db, userId, 'mock-exam-start', now, 12, 86_400_000)) return json({ error: 'rate_limited' }, 429)
    const exam = await startExam(db, userId, minutes)
    return exam ? json({ exam }, 200) : json({ error: 'insufficient_exam_pool' }, 409)
  }
  const match = routePattern.exec(path)
  if (!match) return json({ error: 'not_found' }, 404, method)
  const [, id, action, slot] = match
  if (method === 'POST' && action === 'submit') {
    const exam = await submitExam(db, userId, id, now)
    return exam ? json({ exam }, 200) : json({ error: 'not_found' }, 404)
  }
  if (method === 'GET' && !action) {
    const exam = await examById(db, userId, id, now)
    return exam ? json({ exam }, 200) : json({ error: 'not_found' }, 404)
  }
  const position = Number(slot)
  if (!(position >= 1 && position <= EXAM_COUNT)) return json({ error: 'not_found' }, 404, method)
  if (method === 'GET') {
    const item = await examItem(db, userId, id, position)
    return item ? json({ item }, 200) : json({ error: 'not_found' }, 404)
  }
  if (method === 'POST') {
    const input = await readSmallJson(request) as { choice?: number; version?: number } | null
    const { choice, version } = input ?? {}
    if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice > 3
      || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) return json({ error: 'invalid_input' }, 400)
    const saved = await saveExamChoice(db, userId, id, position, choice, version, Date.now())
    return saved ? json(saved, 200) : json({ error: 'exam_answer_conflict' }, 409)
  }
  return json({ error: 'not_found' }, 404, method)
}
