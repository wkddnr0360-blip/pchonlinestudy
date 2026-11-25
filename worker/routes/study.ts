import { legacyBatchSize, legacyEventId, type LegacyAttempt } from '../../shared/study'
import { json, readSmallJson } from '../http'
import { readMemberAccess } from '../services/book-access'
import { gradeStudyAnswer, importLegacyAttempts, readStudyQuestion, studyCatalog, studyProgress, studyReview, withinStudyLimit } from '../services/study'

export const studyPrefix = '/api/v1/study/'
const eventIdPattern = /^[a-zA-Z0-9_-]{1,100}$/

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function legacyAttempt(value: unknown, now: number): value is LegacyAttempt {
  const { eventId, no, choice, at } = record(value)
  return typeof eventId === 'string' && legacyEventId.test(eventId) && positiveInteger(no)
    && (choice === 'O' || choice === 'X') && positiveInteger(at) && at <= now
}

export async function studyRoute(request: Request, db: D1Database, url: URL, userId: string) {
  const path = url.pathname.slice(studyPrefix.length)
  const method = request.method
  const questionMatch = /^questions\/([1-9]\d{0,8})$/.exec(path)
  const now = Date.now()
  const access = await readMemberAccess(db, userId, now)
  const maxStage = access.bookVerified ? 3 : 1

  if (method === 'GET' && path === 'catalog') {
    return json({ questions: await studyCatalog(db, maxStage), access }, 200)
  }
  if (method === 'GET' && path === 'progress') {
    return json({ progress: await studyProgress(db, userId, maxStage) }, 200)
  }
  if (method === 'GET' && path === 'review') {
    const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER)
    if (!positiveInteger(before)) return json({ error: 'invalid_input' }, 400)
    return json(await studyReview(db, userId, maxStage, before), 200)
  }
  if (method === 'GET' && questionMatch) {
    if (!await withinStudyLimit(db, userId, 'question', now, 60)) return json({ error: 'rate_limited' }, 429)
    const question = await readStudyQuestion(db, Number(questionMatch[1]), maxStage)
    return question ? json({ question }, 200) : json({ error: 'not_found' }, 404)
  }
  if (method === 'POST' && path === 'answers') {
    const { eventId, no, revision, choice } = record(await readSmallJson(request))
    if (typeof eventId !== 'string' || !eventIdPattern.test(eventId) || !positiveInteger(no)
      || !positiveInteger(revision) || (choice !== 'O' && choice !== 'X')) return json({ error: 'invalid_input' }, 400)
    if (!await withinStudyLimit(db, userId, 'answer', now, 60)) return json({ error: 'rate_limited' }, 429)
    const grade = await gradeStudyAnswer(db, userId, maxStage, no, revision, eventId, choice, now)
    return 'result' in grade ? json({ result: grade.result }, 200) : json({ error: grade.error }, grade.status)
  }
  if (method === 'POST' && path === 'import') {
    const { accountId, attempts } = record(await readSmallJson(request, 16_384))
    if (accountId !== userId) return json({ error: 'import_account_changed' }, 409)
    if (!Array.isArray(attempts) || attempts.length < 1 || attempts.length > legacyBatchSize
      || !attempts.every((value) => legacyAttempt(value, now))) return json({ error: 'invalid_input' }, 400)
    if (!await withinStudyLimit(db, userId, 'import', now, 48)) return json({ error: 'rate_limited' }, 429)
    return json(await importLegacyAttempts(db, userId, maxStage, attempts, now), 200)
  }
  return json({ error: 'not_found' }, 404, method)
}
