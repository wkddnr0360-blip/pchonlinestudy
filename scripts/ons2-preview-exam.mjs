import { randomUUID } from 'node:crypto'
import { syntheticQuestion } from '../tests/ons2-book-fixture.mjs'

const makeChoices = () => {
  const pool = { O: [], X: [] }
  for (let no = 1; no <= 120; no++) {
    const question = syntheticQuestion(no)
    pool[question.answer].push(question)
  }
  return Array.from({ length: 20 }, (_, index) => {
    const target = index % 2 === 0 ? 'O' : 'X'
    const opposite = target === 'O' ? 'X' : 'O'
    const options = pool[opposite].splice(0, 3)
    const correctChoice = index % 4
    options.splice(correctChoice, 0, pool[target].shift())
    return { target, options, correctChoice, choice: null, version: 0 }
  })
}

export function previewExams(json, readJson) {
  let exam = null
  function summary(serverTime) {
    if (!exam) return null
    const { id, deadline, submittedAt, items } = exam
    return { id, deadline, submittedAt, serverTime, responses: items.map(({ choice }) => choice),
      score: submittedAt === null ? null : items.filter(({ choice, correctChoice }) => choice === correctChoice).length }
  }
  return async (req, res, path) => {
    const now = Date.now()
    if (exam && exam.submittedAt === null && now >= exam.deadline) exam.submittedAt = exam.deadline
    if (req.method === 'GET' && path === '/api/v1/exam/current') return json(res, { exam: summary(now) })
    if (req.method === 'POST' && path === '/api/v1/exam/start') {
      const { minutes } = await readJson(req)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return json(res, { error: 'invalid_input' }, 400)
      if (!exam || exam.submittedAt !== null) exam = { id: randomUUID(), items: makeChoices(), deadline: now + minutes * 60_000, submittedAt: null }
      return json(res, { exam: summary(now) })
    }
    const match = /^\/api\/v1\/exam\/([a-f0-9-]{36})(?:\/(submit|item\/(\d+)))?$/.exec(path)
    if (!exam || match?.[1] !== exam.id) return json(res, { error: 'not_found' }, 404)
    if (!match[2] && req.method === 'GET') return json(res, { exam: summary(now) })
    if (match[2] === 'submit' && req.method === 'POST') {
      exam.submittedAt ??= now
      return json(res, { exam: summary(now) })
    }
    const position = Number(match[3])
    const item = exam.items[position - 1]
    if (!item) return json(res, { error: 'not_found' }, 404)
    if (req.method === 'POST') {
      const { choice, version } = await readJson(req)
      if (exam.submittedAt !== null || item.version !== version || ![0, 1, 2, 3].includes(choice)) return json(res, { error: 'exam_answer_conflict' }, 409)
      item.choice = choice
      item.version++
      return json(res, { choice, version: item.version })
    }
    const { target, options, choice, version, correctChoice } = item
    return json(res, { item: { position, target, choice, version, options: options.map(({ prompt }) => ({ prompt })),
      ...(exam.submittedAt === null ? {} : { review: { correctChoice, options: options.map(({ no, source, answer, marker, explanation }) => ({ no, source, answer, marker, explanation })) } }),
    } })
  }
}
