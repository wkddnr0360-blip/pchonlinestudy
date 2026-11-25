import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fingerprintedAsset } from '../shared/static-assets.ts'
import { syntheticOutline, syntheticQuestion } from '../tests/ons2-book-fixture.mjs'
import { previewExams } from './ons2-preview-exam.mjs'

const host = '127.0.0.1'
const port = Number(process.argv[2] ?? 8788)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a local port from 1024 through 65535.')
const origin = `http://${host}:${port}`
const client = new URL('../.ons2/client/', import.meta.url)
const ticketCode = 'A1B2C3D4-E5F60718-22334455-66778899'
const expiresAt = Date.parse('2027-03-14T15:00:00Z')
const now = Date.now()
const examples = [
  ['헌법책첫회독', 'pending', null], ['라일락노트', 'pending', null], ['매일OX', 'approved', 'redeemed'],
  ['조용한수험생', 'approved', 'issued'], ['단권화연습', 'resubmit', null], ['한걸음더', 'rejected', null],
].map(([cafeNickname, status, ticket], index) => ({
  id: `preview-${index + 1}`, cafeNickname, status, submittedAt: now - (index + 1) * 55 * 60_000,
  reviewedAt: status === 'pending' ? null : now - 20 * 60_000,
  reviewNote: status === 'resubmit' ? '포스트잇의 카페 닉네임이 보이도록 다시 촬영해 주세요.' : null,
  hasPhoto: true,
  ticket: ticket ? { id: `example-${index}`, issuedAt: now - 2_000, expiresAt: now + 86400000,
    redeemedAt: ticket === 'redeemed' ? now - 1_000 : null, revokedAt: null } : null,
}))
const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
const studyAttempts = { study: new Map(), verified: new Map() }
const viewExam = previewExams(json, readJson)
const studyCatalog = Array.from({ length: 120 }, (_, index) => {
  const { no, stage, part, chapter, section } = syntheticQuestion(index + 1)
  return { no, stage, part, chapter, section }
})

async function previewStudy(req, res, path, mode) {
  const limits = mode === 'verified' ? 120 : 24
  const questions = studyCatalog.slice(0, limits)
  const attempts = studyAttempts[mode]
  const access = mode === 'verified' ? { bookVerified: true, expiresAt } : { bookVerified: false, expiresAt: null }
  if (path === '/api/v1/study/catalog') return json(res, { questions, outline: syntheticOutline(questions), access })
  if (path === '/api/v1/study/progress') return json(res, { progress: {
    attempted: attempts.size, imported: 0, lastNo: [...attempts.keys()].at(-1) ?? null,
  } })
  if (path === '/api/v1/study/review') return json(res, {
    questions: questions.filter(({ no }) => attempts.get(no) === false).map(({ no, stage }) => ({ no, stage })), next: null,
  })
  const read = /^\/api\/v1\/study\/questions\/([1-9][0-9]{0,2})$/.exec(path)
  const body = req.method === 'POST' && path === '/api/v1/study/answers' ? await readJson(req) : null
  const no = read ? Number(read[1]) : body?.no
  if (!Number.isInteger(no) || no < 1 || no > limits) return json(res, { error: 'not_found' }, 404)
  const { id, stage, revision, prompt, source, answer, marker, explanation } = syntheticQuestion(no)
  if (read) return json(res, { question: { id, no, stage, revision, prompt, source } })
  if (body.revision !== revision || !['O', 'X'].includes(body.choice)) return json(res, { error: 'invalid_input' }, 400)
  const correct = body.choice === answer
  attempts.set(no, correct)
  return json(res, { result: { correct, answer, marker, explanation } })
}

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(value))
}

async function readJson(request) {
  let input = ''
  for await (const chunk of request) {
    input += chunk.toString('utf8')
    if (input.length > 2048) throw new Error('Preview input too large')
  }
  return JSON.parse(input || '{}')
}

const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `${host}:${port}` || (req.method === 'POST' && req.headers.origin !== origin)) return json(res, { error: 'local_only' }, 403)
    const url = new URL(req.url, origin)
    const path = url.pathname
    const mode = req.headers.cookie?.match(/(?:^|;\s*)ons-design=(admin|ticket|study|verified|login)(?:;|$)/)?.[1]
    if (['/', '/account', '/admin', '/study', '/exam'].includes(path)) {
      const preview = url.searchParams.get('preview')
      const learner = mode === 'verified' ? 'verified' : 'study'
      const next = path === '/admin' ? 'admin' : path === '/account' ? preview === 'ticket' ? 'ticket' : 'login'
        : preview === 'verified' ? 'verified' : preview === 'free' ? 'study' : learner
      const localBar = `<aside style="margin:0;padding:8px 14px;background:#edf1f9;color:#25355b;font:600 13px/1.5 system-ui;display:flex;flex-wrap:wrap;gap:6px 14px"><strong>로컬 미리보기 · 합성 데이터</strong><a href="/?preview=free">무료 회원</a><a href="/?preview=verified">정회원 체험</a><a href="/account">로그인</a><a href="/account?preview=ticket">황금 티켓</a><a href="/admin">관리자</a>${next === 'ticket' ? `<span>테스트 티켓 <code>${ticketCode}</code></span>` : ''}</aside>`
      const html = (await readFile(new URL('index.html', client), 'utf8')).replace('<body>', '<body>' + localBar)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Set-Cookie': `ons-design=${next}; Path=/; HttpOnly; SameSite=Strict` }).end(html)
      return
    }
    if (fingerprintedAsset.test(path.slice(1))) {
      const file = await readFile(new URL(path.slice(1), client))
      res.writeHead(200, { 'Content-Type': types[extname(path)], 'Cache-Control': 'no-store' }).end(file)
      return
    }
    if (path === '/api/v1/auth-methods') return json(res, { email: true, google: true })
    if (path === '/api/v1/session') {
      if (mode === 'study' || mode === 'verified') return json(res, { user: { id: 'design-study', name: '학습 체험 회원', email: 'preview@example.test' }, access: { bookVerified: mode === 'verified', expiresAt: mode === 'verified' ? expiresAt : null } })
      if (mode !== 'ticket' && mode !== 'admin') return json(res, { error: 'login_required' }, 401)
      const user = { name: mode === 'admin' ? '미리보기 관리자' : '티켓 체험 회원', email: 'preview@example.test' }
      return json(res, { user, access: { bookVerified: false, expiresAt: null }, admin: mode === 'admin' ? { mfaEnabled: true, mfaFresh: true } : null })
    }
    if (path.startsWith('/api/v1/study/')) return mode === 'study' || mode === 'verified'
      ? await previewStudy(req, res, path, mode) : json(res, { error: 'login_required' }, 401)
    if (path.startsWith('/api/v1/exam/')) return mode === 'verified'
      ? await viewExam(req, res, path) : json(res, { error: mode === 'study' ? 'book_required' : 'login_required' }, mode === 'study' ? 403 : 401)
    if (mode === 'ticket' && path === '/api/v1/purchase') return json(res, { purchase: examples[2] })
    if (mode === 'ticket' && path === '/api/v1/book-access/redeem' && req.method === 'POST') {
      const { code } = await readJson(req)
      if (typeof code !== 'string' || code.trim().toUpperCase() !== ticketCode) return json(res, { error: 'invalid_code' }, 409)
      return json(res, { access: { bookVerified: true, expiresAt }, consumedNow: true })
    }
    if (mode === 'admin' && path === '/api/v1/admin/purchases') {
      const filter = url.searchParams.get('status') ?? 'all'
      const query = url.searchParams.get('q')?.toLowerCase() ?? ''
      const matches = examples.filter((row) => row.cafeNickname.toLowerCase().includes(query)
        && (filter === 'all' || row.status === filter || (filter === 'redeemed' && row.ticket?.redeemedAt)))
      return json(res, { purchases: matches, total: matches.length, hasNext: false, summary: {
        total: examples.length, pending: examples.filter((row) => row.status === 'pending').length,
        approved: examples.filter((row) => row.status === 'approved').length, redeemed: examples.filter((row) => row.ticket?.redeemedAt).length,
      } })
    }
    const detail = mode === 'admin' && path.match(/^\/api\/v1\/admin\/purchases\/(preview-\d+)(?:\/(photo|review|ticket|tickets))?$/)
    if (detail) {
      const row = examples.find(({ id }) => id === detail[1])
      if (!row) return json(res, { error: 'not_found' }, 404)
      if (!detail[2]) return json(res, { purchase: row })
      if (detail[2] === 'photo') {
        const fixture = await readFile(new URL('../public/icons/ons-192.png', import.meta.url))
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(fixture)
        return
      }
      if (detail[2] === 'tickets') return json(res, { tickets: row.ticket ? [row.ticket] : [] })
      if (req.method === 'POST' && detail[2] === 'review') {
        const body = await readJson(req)
        row.status = body.decision
        row.reviewNote = body.note
        row.reviewedAt = Date.now()
        return json(res, { ok: true })
      }
      if (req.method === 'POST' && detail[2] === 'ticket') {
        row.ticket = { id: row.id, issuedAt: Date.now(), expiresAt, redeemedAt: null, revokedAt: null }
        return json(res, { code: ticketCode, ticket: row.ticket }, 201)
      }
    }
    const revoke = mode === 'admin' && path.match(/^\/api\/v1\/admin\/tickets\/([\w-]+)\/revoke$/)
    if (revoke && req.method === 'POST') {
      const ticket = examples.find((row) => row.ticket?.id === revoke[1])?.ticket
      if (ticket) ticket.revokedAt = Date.now()
      return json(res, { ok: Boolean(ticket) }, ticket ? 200 : 404)
    }
    return json(res, { error: 'preview_only' }, 404)
  } catch {
    if (!res.headersSent) json(res, { error: 'preview_unavailable' }, 503)
    else res.end()
  }
})

server.listen(port, host, () => console.log(`ONS 2.0 local design preview: ${origin}`))
