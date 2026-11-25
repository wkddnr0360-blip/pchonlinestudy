import type { StudyResult } from '../../shared/study'
import type { AppEnv } from '../index'
import { issueStatisticsContext, statisticsTiming } from '../analytics/context'
import { readStudyStatistics, recommendCommonMistakes, recommendStudyQuestions } from '../analytics/read'
import { json, readSmallJson } from '../http'
import { readMemberAccess } from '../services/book-access'
import { gradeStudyAnswer, readStudyQuestion, studyCatalog, studyProgress, studyReview, withinStudyLimit } from '../services/study'

export const studyPrefix = '/api/v1/study/'
const eventIdPattern = /^[a-zA-Z0-9_-]{1,100}$/

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function studyRoute(request: Request, env: AppEnv, url: URL, userId: string) {
  const { DB: db } = env
  const secret = env.ANALYTICS_ENABLED === '1' ? env.BETTER_AUTH_SECRET : undefined
  const path = url.pathname.slice(studyPrefix.length)
  const method = request.method
  const questionMatch = /^questions\/([1-9]\d{0,8})$/.exec(path)
  const now = Date.now()
  const access = await readMemberAccess(db, userId, now)
  const maxStage = access.bookVerified ? 3 : 1

  if (method === 'GET' && path === 'catalog') {
    return json({ ...await studyCatalog(db, maxStage), access, recommendationsAvailable: Boolean(secret) }, 200)
  }
  if (method === 'GET' && path === 'progress') {
    return json({ progress: await studyProgress(db, userId, maxStage) }, 200)
  }
  if (method === 'GET' && path === 'review') {
    const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER)
    if (!positiveInteger(before)) return json({ error: 'invalid_input' }, 400)
    return json(await studyReview(db, userId, maxStage, before), 200)
  }
  if (method === 'GET' && path === 'recommendations' && secret) {
    const stage = Number(url.searchParams.get('stage'))
    if (!positiveInteger(stage) || stage > maxStage) return json({ error: 'not_found' }, 404)
    const mode = url.searchParams.get('mode') ?? 'personal'
    if (mode !== 'personal' && mode !== 'common') return json({ error: 'invalid_input' }, 400)
    if (!await withinStudyLimit(db, userId, 'recommendations', now, 6)) return json({ error: 'rate_limited' }, 429)
    return json({ numbers: await (mode === 'common' ? recommendCommonMistakes(db, stage) : recommendStudyQuestions(db, userId, stage)) }, 200)
  }
  if (method === 'GET' && questionMatch) {
    if (!await withinStudyLimit(db, userId, 'question', now, 60)) return json({ error: 'rate_limited' }, 429)
    const question = await readStudyQuestion(db, Number(questionMatch[1]), maxStage)
    if (!question) return json({ error: 'not_found' }, 404)
    if (secret && url.searchParams.get('mode') === 'basic') {
      question.statisticsContext = await issueStatisticsContext(secret, userId, question.no, question.revision, now).catch(() => undefined)
    }
    return json({ question }, 200)
  }
  if (method === 'POST' && path === 'answers') {
    const { eventId, no, revision, choice, statisticsProof } = record(await readSmallJson(request))
    if (typeof eventId !== 'string' || !eventIdPattern.test(eventId) || !positiveInteger(no)
      || !positiveInteger(revision) || (choice !== 'O' && choice !== 'X')) return json({ error: 'invalid_input' }, 400)
    if (!await withinStudyLimit(db, userId, 'answer', now, 60)) return json({ error: 'rate_limited' }, 429)
    const timing = secret ? await statisticsTiming(secret, userId, no, revision, eventId, statisticsProof, now).catch(() => undefined) : undefined
    const grade = await gradeStudyAnswer(db, userId, maxStage, no, revision, eventId, choice, now, timing).catch((error: unknown) => {
      if (!timing) throw error
      return gradeStudyAnswer(db, userId, maxStage, no, revision, eventId, choice, now)
    })
    if (!('result' in grade) || !grade.result) return json({ error: grade.error }, grade.status)
    const result: StudyResult = grade.result
    if (grade.statisticsVersion !== null) {
      result.statistics = await readStudyStatistics(db, userId, no, grade.statisticsVersion).catch(() => undefined)
    }
    return json({ result }, 200)
  }
  return json({ error: 'not_found' }, 404, method)
}
