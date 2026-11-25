import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { decode, encode } from 'jpeg-js'
import { createTestHarness } from 'wrangler'
import { seedSyntheticBook } from './ons2-book-fixture.mjs'

const origin = 'http://127.0.0.1:8787'
const fixtureClient = 'synthetic-ons2.apps.googleusercontent.com'
const harness = createTestHarness({
  workers: [{
    configPath: './cloudflare/wrangler.local.jsonc',
    vars: { AUTH_EMAIL_MODE: 'fixtures' },
    secrets: {
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
      GOOGLE_CLIENT_ID: fixtureClient,
      GOOGLE_CLIENT_SECRET: randomBytes(32).toString('base64url'),
    },
  }],
})
const worker = harness.getWorker('pch-ons2-local')
let env

async function api(path, { body, cookie, sentOrigin = origin, ip = '192.0.2.11' } = {}) {
  const headers = new Headers({ 'CF-Connecting-IP': ip })
  let payload
  if (cookie) headers.set('Cookie', cookie)
  if (body) {
    if (body instanceof FormData) {
      const encoded = new Request(origin, { method: 'POST', body })
      headers.set('Content-Type', encoded.headers.get('Content-Type'))
      payload = await encoded.arrayBuffer()
    } else {
      headers.set('Content-Type', 'application/json')
      payload = JSON.stringify(body)
    }
    headers.set('Origin', sentOrigin)
  }
  return harness.fetch(origin + '/api/v1' + path, {
    method: body ? 'POST' : 'GET', headers, body: payload, redirect: 'manual',
  })
}

async function signup(email, password) {
  return api('/auth/sign-up/email', { body: { email, name: '합성 회원', password, callbackURL: origin + '/account' } })
}

async function verifyEmail(email) {
  const message = await env.DB.prepare("SELECT url FROM local_mail_fixtures WHERE kind = 'verify' AND email = ?").bind(email).first('url')
  assert.ok(message, 'local synthetic verification message was delivered')
  return harness.fetch(message, { redirect: 'manual' })
}

async function signIn(email, password) {
  const response = await api('/auth/sign-in/email', { body: { email, password } })
  assert.equal(response.status, 200, await response.clone().text())
  assert.deepEqual(await response.json(), { ok: true })
  const cookie = response.headers.getSetCookie().find((value) => value.includes('session_token='))
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  return cookie.split(';')[0]
}

function cookieFrom(response, name) {
  const value = response.headers.getSetCookie().find((entry) => entry.includes(name + '='))
  assert.ok(value)
  return value.split(';')[0]
}

function totp(uri) {
  const key = new URL(uri).searchParams.get('secret')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...key.replace(/=+$/, '')].map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const secret = Buffer.from(bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hash = createHmac('sha1', secret).update(counter).digest()
  return String((hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

before(async () => {
  await harness.listen()
  await worker.applyD1Migrations('DB')
  env = await worker.getEnv()
  await seedSyntheticBook(env.DB)
})

after(async () => { await harness.close() })
beforeEach(async () => { await env.DB.prepare('DELETE FROM auth_rate_limits').run() })

test('private OX projects one prompt, grades on D1 and imports progress only to the confirmed account', async () => {
  assert.equal((await api('/study/questions/1')).status, 401)
  const password = 'Synthetic study fixture 26!'
  const email = 'study@example.test'
  assert.equal((await signup(email, password)).status, 200)
  await verifyEmail(email)
  const cookie = await signIn(email, password)
  const { user } = await (await api('/session', { cookie })).json()
  const catalog = await (await api('/study/catalog', { cookie })).json()
  assert.equal(catalog.questions.length, 24)
  assert.ok(catalog.questions.every(({ stage }) => stage === 1))
  assert.ok(catalog.outline.some(({ label }) => label === '제2절 적용 연습'))
  assert.ok(catalog.outline.every(({ stage }) => stage === 1))
  assert.equal((await api('/study/questions/25', { cookie })).status, 404)

  const response = await api('/study/questions/1', { cookie })
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store')
  const { question } = await response.json()
  assert.deepEqual(Object.keys(question).sort(), ['id', 'no', 'prompt', 'revision', 'source', 'stage'])
  assert.equal(question.id, 'pch-ox-1')
  const body = { no: question.no, revision: question.revision, eventId: randomUUID(), choice: 'O', correct: true }
  assert.equal((await api('/study/answers', { cookie, body, sentOrigin: 'https://other.example.test' })).status, 403)
  assert.equal((await api('/study/answers', { cookie, body: { ...body, revision: 99 } })).status, 409)
  assert.equal((await api('/study/answers', { cookie, body: { ...body, no: 25 } })).status, 404)
  const retries = await Promise.all([api('/study/answers', { cookie, body }), api('/study/answers', { cookie, body })])
  for (const reply of retries) {
    assert.equal(reply.status, 200, await reply.clone().text())
    const { result } = await reply.json()
    assert.equal(result.correct, false)
    assert.equal(result.answer, 'X')
    assert.equal(result.explanation[0].kind, 'text')
  }
  assert.equal((await api('/study/answers', { cookie, body: { ...body, choice: 'X' } })).status, 409)
  assert.deepEqual(await (await api('/study/review', { cookie })).json(), { questions: [{ no: 1, stage: 1 }], next: null })

  const at = Date.now() - 60_000
  const attempts = [{ eventId: 'legacy-session:1', no: 2, choice: 'O', at }, { eventId: 'legacy-session:25', no: 25, choice: 'X', at }]
  assert.equal((await api('/study/import', { cookie, body: { accountId: 'other-account', attempts } })).status, 409)
  const importBody = { accountId: user.id, attempts }
  assert.deepEqual(await (await api('/study/import', { cookie, body: importBody })).json(), { imported: 1, skipped: 1 })
  assert.deepEqual(await (await api('/study/import', { cookie, body: importBody })).json(), { imported: 0, skipped: 2 })
  assert.deepEqual(await (await api('/study/progress', { cookie })).json(), { progress: { attempted: 1, imported: 1, lastNo: 1 } })
  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM study_attempts WHERE user_id = ?').bind(user.id).first()
  assert.equal(count, 2)
  const { is_correct } = await env.DB.prepare("SELECT is_correct FROM study_attempts WHERE user_id = ? AND kind = 'legacy'").bind(user.id).first()
  assert.equal(is_correct, null)

  await env.DB.prepare('INSERT INTO member_controls (user_id, suspended_at) VALUES (?, ?)').bind(user.id, Date.now()).run()
  assert.equal((await api('/study/progress', { cookie })).status, 403)
})

test('verified email sessions, password resets and revocation stay server-side', async () => {
  const email = 'student@example.test'
  const password = 'Synthetic account password 26!'
  const registered = await signup(email, password)
  assert.equal(registered.status, 200, await registered.clone().text())
  assert.deepEqual(await registered.json(), { ok: true })
  assert.equal((await api('/auth/sign-in/email', { body: { email, password } })).status, 403)

  const verified = await verifyEmail(email)
  assert.equal(verified.status, 302)
  assert.equal(verified.headers.get('location'), origin + '/account')
  const cookie = await signIn(email, password)
  const status = await api('/session', { cookie })
  assert.equal(status.status, 200)
  assert.equal(status.headers.get('cache-control'), 'private, no-store')
  assert.equal((await status.json()).user.email, email)

  const reset = await api('/auth/request-password-reset', { body: { email, redirectTo: origin + '/account' } })
  assert.equal(reset.status, 200)
  const message = await env.DB.prepare("SELECT url FROM local_mail_fixtures WHERE kind = 'reset' AND email = ?").bind(email).first('url')
  assert.ok(message)
  const callback = await harness.fetch(message, { redirect: 'manual' })
  assert.equal(callback.status, 302)
  const token = new URL(callback.headers.get('location')).searchParams.get('token')
  assert.ok(token)
  const newPassword = 'New synthetic account password 26!'
  const changed = await api('/auth/reset-password', { body: { token, newPassword } })
  assert.equal(changed.status, 200)
  assert.equal((await api('/session', { cookie })).status, 401)
  assert.equal((await api('/auth/reset-password', { body: { token, newPassword } })).status, 400)
  const replacement = await signIn(email, newPassword)
  assert.equal((await api('/auth/sign-out', { body: {}, cookie: replacement })).status, 200)
  assert.equal((await api('/session', { cookie: replacement })).status, 401)
})

test('Google OAuth begins with a new state and S256 challenge; wrong origins are rejected', async () => {
  const body = { provider: 'google', callbackURL: origin + '/account', disableRedirect: true }
  const rejected = await api('/auth/sign-in/social', { body, sentOrigin: 'https://untrusted.invalid' })
  assert.equal(rejected.status, 403)
  const response = await api('/auth/sign-in/social', { body })
  assert.equal(response.status, 200, await response.clone().text())
  const redirect = new URL((await response.json()).url)
  assert.equal(redirect.origin, 'https://accounts.google.com')
  assert.equal(redirect.searchParams.get('client_id'), fixtureClient)
  assert.equal(redirect.searchParams.get('redirect_uri'), origin + '/api/v1/auth/callback/google')
  assert.equal(redirect.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(redirect.searchParams.get('state'))
  assert.ok(redirect.searchParams.get('code_challenge'))
})

test('the same account can retry redemption without a duplicate grant, and revocation is checked live', async () => {
  const password = 'Synthetic entitlement password 26!'
  const accounts = []
  for (const email of ['purchaser@example.test', 'another@example.test']) {
    assert.equal((await signup(email, password)).status, 200)
    assert.equal((await verifyEmail(email)).status, 302)
    const cookie = await signIn(email, password)
    const session = await api('/session', { cookie })
    assert.equal(session.status, 200)
    const { user, access } = await session.json()
    assert.equal(access.bookVerified, false)
    accounts.push({ user, cookie })
  }
  const [owner, other] = accounts
  const campaign = 'ons-season-5'
  const requestId = randomUUID()
  const codeId = randomUUID()
  const now = Date.now()
  const code = randomBytes(16).toString('hex').toUpperCase()
  const hash = createHash('sha256').update(code).digest('hex')
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO purchase_requests (id, user_id, campaign_id, cafe_nickname, status, submitted_at, reviewed_at)
      VALUES (?, ?, ?, '합성 닉네임', 'approved', ?, ?)`)
      .bind(requestId, owner.user.id, campaign, now, now),
    env.DB.prepare(`INSERT INTO access_codes (id, request_id, user_id, campaign_id, code_hash, issued_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(codeId, requestId, owner.user.id, campaign, hash, now, now + 60_000),
  ])

  const submit = (account) => api('/book-access/redeem', { body: { code }, cookie: account.cookie })
  const results = await Promise.all([submit(other), submit(owner), submit(owner)])
  assert.deepEqual(results.map(({ status }) => status), [409, 200, 200])
  const redemptions = await Promise.all(results.slice(1).map((response) => response.json()))
  assert.equal(redemptions.filter(({ consumedNow }) => consumedNow).length, 1)
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE target_id = ?').bind(codeId).first()).count, 1)
  assert.deepEqual((await (await api('/session', { cookie: owner.cookie })).json()).access, {
    bookVerified: true, expiresAt: Date.parse('2027-03-14T15:00:00Z'),
  })
  assert.equal((await (await api('/study/catalog', { cookie: owner.cookie })).json()).questions.length, 120)
  assert.equal((await api('/exam/current', { cookie: other.cookie })).status, 403)
  const start = () => api('/exam/start', { cookie: owner.cookie, body: { minutes: 20 } })
  const joined = await Promise.all([start(), start()])
  for (const reply of joined) assert.equal(reply.status, 200, await reply.clone().text())
  const [firstExam, repeatedExam] = await Promise.all(joined.map((reply) => reply.json()))
  const exam = firstExam.exam
  assert.equal(exam.id, repeatedExam.exam.id)
  assert.equal(exam.responses.length, 20)
  assert.equal(exam.score, null)
  assert.ok(exam.deadline - exam.serverTime <= 1_200_000 && exam.deadline - exam.serverTime > 1_190_000)
  const itemPath = '/exam/' + exam.id + '/item/1'
  const itemReply = await api(itemPath, { cookie: owner.cookie })
  assert.equal(itemReply.headers.get('Cache-Control'), 'private, no-store')
  const { item } = await itemReply.json()
  assert.equal(item.options.length, 4)
  assert.equal(item.review, undefined)
  assert.ok(item.options.every((option) => Object.keys(option).join() === 'prompt'))
  assert.equal((await api(itemPath, { cookie: owner.cookie, body: { choice: 1, version: 0 }, sentOrigin: 'https://other.example.test' })).status, 403)
  assert.equal((await api(itemPath, { cookie: owner.cookie, body: { choice: 1, version: 0 } })).status, 200)
  assert.equal((await api(itemPath, { cookie: owner.cookie, body: { choice: 2, version: 0 } })).status, 409)
  const past = Date.now() - 100
  await env.DB.prepare('UPDATE mock_exams SET started_at = ?, deadline = ? WHERE id = ?').bind(past - 60_000, past, exam.id).run()
  const { exam: timedOut } = await (await api('/exam/' + exam.id, { cookie: owner.cookie })).json()
  assert.equal(timedOut.submittedAt, past)
  assert.equal(timedOut.responses[0], 1)
  assert.ok([0, 1].includes(timedOut.score))
  const { item: graded } = await (await api(itemPath, { cookie: owner.cookie })).json()
  assert.deepEqual(graded.options, item.options)
  assert.equal(timedOut.score, Number(graded.review.correctChoice === 1))
  assert.match(graded.review.options[0].source, /합성/)
  assert.equal((await api(itemPath, { cookie: owner.cookie, body: { choice: 2, version: 1 } })).status, 409)
  const { question: premium } = await (await api('/study/questions/120', { cookie: owner.cookie })).json()
  assert.equal(premium.stage, 3)
  assert.equal((await api('/study/questions/120', { cookie: other.cookie })).status, 404)
  const premiumAnswer = { no: premium.no, revision: premium.revision, eventId: randomUUID(), choice: 'O' }
  assert.equal((await api('/study/answers', { cookie: owner.cookie, body: premiumAnswer })).status, 200)
  await env.DB.prepare('UPDATE book_campaigns SET ends_at = ? WHERE id = ?').bind(Date.now(), campaign).run()
  assert.equal((await (await api('/session', { cookie: owner.cookie })).json()).access.bookVerified, false)
  assert.equal((await api(itemPath, { cookie: owner.cookie })).status, 403)
  assert.equal((await api('/study/answers', { cookie: owner.cookie, body: premiumAnswer })).status, 404)
  assert.equal((await (await api('/study/progress', { cookie: owner.cookie })).json()).progress.attempted, 0)
  await env.DB.prepare('UPDATE book_campaigns SET ends_at = ? WHERE id = ?').bind(Date.parse('2027-03-14T15:00:00Z'), campaign).run()
  await env.DB.prepare('UPDATE entitlements SET revoked_at = ? WHERE code_id = ?').bind(Date.now(), codeId).run()
  assert.equal((await submit(owner)).status, 409)
  assert.equal((await (await api('/session', { cookie: owner.cookie })).json()).access.bookVerified, false)
})

test('a verified member submits a private photo; an MFA admin issues and retires single-use tickets', async () => {
  const password = 'Synthetic purchase review password!'
  const adminEmail = 'purchase-admin@example.test'
  const memberEmail = 'purchase-member@example.test'
  for (const email of [adminEmail, memberEmail]) {
    assert.equal((await signup(email, password)).status, 200)
    assert.equal((await verifyEmail(email)).status, 302)
  }
  let adminCookie = await signIn(adminEmail, password)
  const memberCookie = await signIn(memberEmail, password)
  const session = await (await api('/session', { cookie: adminCookie })).json()
  await env.DB.prepare("INSERT INTO member_roles(user_id, role) VALUES (?, 'admin')").bind(session.user.id).run()

  const requestQueue = (cookie) => api('/admin/purchases', { cookie })
  assert.equal((await requestQueue()).status, 401)
  assert.equal((await requestQueue(memberCookie)).status, 403)
  assert.equal((await requestQueue(adminCookie)).status, 403)
  assert.equal((await api('/auth/two-factor/enable', { cookie: memberCookie, body: { password } })).status, 403)

  const setup = await api('/auth/two-factor/enable', { cookie: adminCookie, body: { password } })
  assert.equal(setup.status, 200, await setup.clone().text())
  const { totpURI } = await setup.json()
  assert.ok(totpURI.startsWith('otpauth:'))
  const enrollment = await api('/auth/two-factor/verify-totp', { cookie: adminCookie, body: { code: totp(totpURI) } })
  assert.equal(enrollment.status, 200, await enrollment.clone().text())
  if (enrollment.headers.getSetCookie().some((header) => header.includes('session_token='))) {
    adminCookie = cookieFrom(enrollment, 'session_token')
  }
  await api('/auth/sign-out', { cookie: adminCookie, body: {} })
  const challenge = await api('/auth/sign-in/email', { body: { email: adminEmail, password } })
  assert.equal(challenge.status, 200, await challenge.clone().text())
  assert.deepEqual(await challenge.json(), { ok: true, twoFactorRequired: true })
  const proof = await api('/auth/two-factor/verify-totp', { cookie: cookieFrom(challenge, 'two_factor'), body: { code: totp(totpURI) } })
  assert.equal(proof.status, 200, await proof.clone().text())
  assert.deepEqual(await proof.json(), { ok: true, adminMfa: true })
  adminCookie = cookieFrom(proof, 'session_token')
  assert.equal((await requestQueue(adminCookie)).status, 200)
  const analysis = await api('/admin/study-statistics?stage=1&page=1', { cookie: adminCookie })
  assert.equal(analysis.status, 200)
  assert.deepEqual((await analysis.json()).boundaries, [90, 75, 50, 30])
  const difficultyPath = '/admin/study-statistics/difficulty'
  assert.equal((await api(difficultyPath, { cookie: adminCookie, body: { boundaries: [75, 90, 50, 30] } })).status, 400)
  assert.equal((await api(difficultyPath, { cookie: adminCookie, body: { boundaries: [92, 75, 50, 30] } })).status, 200)
  assert.ok(await env.DB.prepare("SELECT 1 FROM audit_events WHERE action = 'study_difficulty_updated'").first())

  const jpeg = encode({ width: 200, height: 200, data: Buffer.alloc(200 * 200 * 4, 128) }, 75).data
  const embedded = Buffer.from('fixture-photo-metadata', 'utf8')
  const appSegment = Buffer.from([0xff, 0xe1, 0, embedded.length + 2])
  const photo = Buffer.concat([jpeg.subarray(0, 2), appSegment, embedded, jpeg.subarray(2)])
  const form = new FormData()
  form.set('nickname', '합성 카페 회원')
  form.set('photo', new Blob([new Uint8Array(512 * 1024 + 1)], { type: 'image/jpeg' }), 'oversized.jpg')
  assert.equal((await api('/purchase', { cookie: memberCookie, body: form })).status, 413)
  form.set('photo', new Blob([photo.subarray(0, -2)], { type: 'image/jpeg' }), 'truncated.jpg')
  assert.equal((await api('/purchase', { cookie: memberCookie, body: form })).status, 422)
  form.set('photo', new Blob([photo], { type: 'image/jpeg' }), 'fixture.jpg')
  const submissions = await Promise.all([
    api('/purchase', { cookie: memberCookie, body: form }),
    api('/purchase', { cookie: memberCookie, body: form }),
  ])
  assert.deepEqual(submissions.map(({ status }) => status).sort(), [201, 409])
  const submitted = submissions.find((response) => response.ok)
  assert.equal(submitted.status, 201, await submitted.clone().text())
  const { purchase } = await submitted.json()
  assert.equal(purchase.status, 'pending')
  const photoSize = (id) => env.DB.prepare('SELECT length(jpeg) AS bytes FROM purchase_request_photos WHERE purchase_id = ?').bind(id).first('bytes')
  assert.equal(await env.DB.prepare('SELECT count(*) AS count FROM purchase_request_photos').first('count'), 1)
  const adminRequest = `/admin/purchases/${purchase.id}`
  assert.equal((await api(adminRequest + '/photo', { cookie: memberCookie })).status, 403)
  assert.equal((await harness.fetch(`${origin}/verification/${purchase.id}.jpg`)).status, 404)
  const savedPhoto = await api(adminRequest + '/photo', { cookie: adminCookie })
  assert.equal(savedPhoto.status, 200)
  assert.equal(savedPhoto.headers.get('cache-control'), 'private, no-store')
  const savedBytes = Buffer.from(await savedPhoto.arrayBuffer())
  assert.equal(savedBytes.includes(embedded), false)
  assert.equal(decode(savedBytes, { useTArray: true }).width, 200)
  assert.equal(await photoSize(purchase.id), savedBytes.length)
  assert.equal((await api(adminRequest + '/ticket', { body: { expectedTicketId: null }, cookie: adminCookie })).status, 409)

  const dayMs = 86_400_000
  const runPhotoCleanup = async (at) => {
    const cleanup = await worker.scheduled({ cron: '0 * * * *', scheduledTime: new Date(at) })
    assert.equal(cleanup.outcome, 'ok')
  }
  await runPhotoCleanup(purchase.submittedAt + 31 * dayMs)
  assert.ok(await photoSize(purchase.id))

  const review = await api(adminRequest + '/review', { body: { decision: 'approved' }, cookie: adminCookie })
  assert.equal(review.status, 200, await review.clone().text())
  const issue = (expectedTicketId) => api(adminRequest + '/ticket', { body: { expectedTicketId }, cookie: adminCookie })
  const race = await Promise.all([issue(null), issue(null)])
  assert.deepEqual(race.map((response) => response.status).sort(), [201, 409])
  const first = await race.find((response) => response.ok).json()
  const second = await (await issue(first.ticket.id)).json()
  assert.notEqual(first.code, second.code)
  assert.match(second.code, /^[0-9A-F]{8}(?:-[0-9A-F]{8}){3}$/)
  const apply = (code, cookie) => api('/book-access/redeem', { body: { code }, cookie })
  assert.equal((await apply(first.code, memberCookie)).status, 409)
  assert.equal((await apply(second.code, adminCookie)).status, 409)
  const firstUse = await apply(second.code, memberCookie)
  assert.equal(firstUse.status, 200)
  assert.equal((await firstUse.json()).consumedNow, true)
  assert.equal((await (await apply(second.code, memberCookie)).json()).consumedNow, false)

  const adminQueue = await requestQueue(adminCookie)
  const queueData = await adminQueue.text()
  assert.equal(queueData.includes(second.code), false)
  const reviewed = JSON.parse(queueData).purchases.find((item) => item.id === purchase.id)
  assert.ok(reviewed.ticket.redeemedAt)
  const filtered = await (await api('/admin/purchases?status=redeemed&q=' + encodeURIComponent('합성 카페'), { cookie: adminCookie })).json()
  assert.equal(filtered.total, 1)
  assert.equal(filtered.summary.redeemed, 1)
  assert.equal(filtered.purchases[0].id, purchase.id)
  const detail = await (await api(adminRequest, { cookie: adminCookie })).json()
  assert.equal(detail.purchase.id, purchase.id)
  const history = await (await api(adminRequest + '/tickets', { cookie: adminCookie })).json()
  assert.equal(history.tickets.length, 2)
  assert.ok(history.tickets.find((ticket) => ticket.id === first.ticket.id).revokedAt)
  assert.ok(history.tickets.find((ticket) => ticket.id === second.ticket.id).redeemedAt)
  assert.equal((await api(`/admin/tickets/${second.ticket.id}/revoke`, { body: {}, cookie: adminCookie })).status, 409)

  const rejectedId = randomUUID()
  await env.DB.prepare(`INSERT INTO purchase_requests
    (id, user_id, campaign_id, cafe_nickname, status, submitted_at, reviewed_at, reviewed_by)
    SELECT ?, user_id, campaign_id, '합성 반려', 'rejected', submitted_at, reviewed_at, reviewed_by
    FROM purchase_requests WHERE id = ?`).bind(rejectedId, purchase.id).run()
  await env.DB.prepare('INSERT INTO purchase_request_photos (purchase_id, jpeg) VALUES (?, ?)').bind(rejectedId, jpeg).run()

  const approvedPhotoExpiry = detail.purchase.reviewedAt + 7 * dayMs
  await runPhotoCleanup(approvedPhotoExpiry - 1)
  assert.equal((await api(adminRequest + '/photo', { cookie: adminCookie })).status, 200)
  await runPhotoCleanup(approvedPhotoExpiry)
  assert.equal(await photoSize(purchase.id), null)
  assert.equal((await api(adminRequest + '/photo', { cookie: adminCookie })).status, 404)
  const { purchase: afterCleanup } = await (await api(adminRequest, { cookie: adminCookie })).json()
  assert.equal(afterCleanup.hasPhoto, false)
  assert.equal(afterCleanup.status, 'approved')
  assert.equal(afterCleanup.ticket.redeemedAt, reviewed.ticket.redeemedAt)
  assert.equal((await (await api('/session', { cookie: memberCookie })).json()).access.bookVerified, true)
  assert.ok(await photoSize(rejectedId))
  await runPhotoCleanup(detail.purchase.reviewedAt + 30 * dayMs)
  assert.equal(await photoSize(rejectedId), null)
  assert.ok(await env.DB.prepare("SELECT 1 FROM audit_events WHERE target_id = ? AND action = 'purchase_photo_purged'").bind(purchase.id).first())

  const now = Date.now()
  await env.DB.prepare('UPDATE admin_mfa SET verified_at = ?').bind(now - 16 * 60 * 1000).run()
  assert.equal((await requestQueue(adminCookie)).status, 403)
  await env.DB.prepare('DELETE FROM member_roles WHERE user_id = ?').bind(session.user.id).run()
  assert.equal((await requestQueue(adminCookie)).status, 403)
})

test('basic OX statistics survive retries, validate cohorts, and resume after the daily budget resets', async () => {
  const password = 'Synthetic statistics member password!'
  const email = 'analytics-member@example.test'
  assert.equal((await signup(email, password)).status, 200)
  assert.equal((await verifyEmail(email)).status, 302)
  const cookie = await signIn(email, password)
  const { user } = await (await api('/session', { cookie })).json()
  const questionPath = '/study/questions/1'
  const getQuestion = async () => (await (await api(questionPath + '?mode=basic', { cookie })).json()).question
  const bodyFor = (question, choice) => ({
    no: question.no, revision: question.revision, choice,
    eventId: question.statisticsContext.eventId, statisticsProof: question.statisticsContext.proof,
  })
  const submit = (body) => api('/study/answers', { cookie, body })
  const aggregate = async (time = Date.now()) => {
    const event = { cron: '*/5 * * * *', scheduledTime: new Date(time) }
    assert.equal((await worker.scheduled(event)).outcome, 'ok')
  }
  assert.equal((await api('/admin/study-statistics', { cookie })).status, 403)
  const first = await getQuestion()
  assert.ok(first.statisticsContext.proof)
  assert.equal(first.statistics, undefined)
  const { question: review } = await (await api(questionPath, { cookie })).json()
  assert.equal(review.statisticsContext, undefined)
  const answer = await env.DB.prepare('SELECT answer FROM question_revisions WHERE no = 1 AND revision = 1').first('answer')
  const wrong = answer === 'O' ? 'X' : 'O'
  const firstBody = bodyFor(first, wrong)
  const submissions = await Promise.all([submit(firstBody), submit(firstBody)])
  assert.deepEqual(submissions.map((response) => response.status), [200, 200])
  const { result } = await submissions[0].json()
  assert.equal(result.correct, false)
  assert.equal(result.statistics.sample, null)
  assert.equal(result.statistics.mine.wrong, 1)
  assert.deepEqual((await (await api('/study/recommendations?stage=1', { cookie })).json()).numbers, [1])

  assert.equal((await submit(bodyFor(await getQuestion(), answer))).status, 200)
  assert.equal((await submit({ ...firstBody, eventId: randomUUID() })).status, 200)
  const rowsForMember = (await env.DB.prepare('SELECT statistics_first AS first FROM study_attempts WHERE user_id = ? ORDER BY rowid')
    .bind(user.id).all()).results
  assert.deepEqual(rowsForMember.map(({ first }) => first), [1, 0, null])
  await Promise.all([aggregate(), aggregate()])
  const counts = () => env.DB.prepare('SELECT first_wrong AS firstWrong, repeat_correct AS repeatCorrect FROM study_statistics WHERE no = 1 AND statistics_version = 1').first()
  assert.deepEqual(await counts(), { firstWrong: 1, repeatCorrect: 1 })

  const now = Date.now()
  const day = Math.floor(now / 86_400_000)
  await env.DB.prepare('UPDATE study_statistics_job SET day = ?, writes = 9999 WHERE id = 1').bind(day).run()
  const delayed = bodyFor(await getQuestion(), answer)
  assert.equal((await submit(delayed)).status, 200)
  await aggregate(now)
  assert.deepEqual(await counts(), { firstWrong: 1, repeatCorrect: 1 })
  assert.equal(await env.DB.prepare('SELECT status FROM study_statistics_job WHERE id = 1').first('status'), 'paused')
  await aggregate((day + 1) * 86_400_000)
  assert.deepEqual(await counts(), { firstWrong: 1, repeatCorrect: 2 })

  const stale = await getQuestion()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO question_revisions (no, revision, prompt, source, answer, marker, explanation)
      SELECT no, 2, prompt, source, answer, marker, explanation FROM question_revisions WHERE no = 1 AND revision = 1`),
    env.DB.prepare('INSERT INTO study_statistics_versions (no, revision, statistics_version) VALUES (1, 2, 1)'),
    env.DB.prepare('UPDATE book_questions SET active_revision = 2 WHERE no = 1'),
  ])
  assert.equal((await submit(bodyFor(stale, answer))).status, 409)
  assert.equal((await submit(bodyFor(await getQuestion(), answer))).status, 200)
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO question_revisions (no, revision, prompt, source, answer, marker, explanation)
      SELECT no, 3, prompt, source, ?, CASE WHEN ? = 'O' THEN '[○]' ELSE '[×]' END, explanation
      FROM question_revisions WHERE no = 1 AND revision = 2`).bind(wrong, wrong),
    env.DB.prepare('UPDATE book_questions SET active_revision = 3 WHERE no = 1'),
  ])
  assert.equal((await submit(bodyFor(await getQuestion(), wrong))).status, 200)
  await aggregate((day + 1) * 86_400_000 + 300_000)
  assert.deepEqual(await counts(), { firstWrong: 1, repeatCorrect: 3 })
  assert.equal(await env.DB.prepare('SELECT first_correct FROM study_statistics WHERE no = 1 AND statistics_version = 3').first('first_correct'), 1)
  const seedFirstAttempts = async (start, end) => {
    await env.DB.batch([
      env.DB.prepare(`WITH RECURSIVE seq(i) AS (SELECT ? UNION ALL SELECT i + 1 FROM seq WHERE i < ?)
        INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
        SELECT 'stats-fixture-' || i, 'Fixture', 'stats-fixture-' || i || '@example.test', 1, 1, 1 FROM seq`).bind(start, end),
      env.DB.prepare(`WITH RECURSIVE seq(i) AS (SELECT ? UNION ALL SELECT i + 1 FROM seq WHERE i < ?)
        INSERT INTO study_attempts (user_id, event_id, kind, no, choice, revision, is_correct, occurred_at, received_at, statistics_version, statistics_first, elapsed_ms)
        SELECT 'stats-fixture-' || i, 'fixture', 'study', 1, ?, 3, 0, ?, ?, 3, 1, 2000 FROM seq`).bind(start, end, answer, now, now),
    ])
  }
  const published = async () => (await (await submit(bodyFor(await getQuestion(), wrong))).json()).result.statistics
  await seedFirstAttempts(1, 8)
  await aggregate((day + 1) * 86_400_000 + 600_000)
  assert.equal((await published()).sample, null)
  await seedFirstAttempts(9, 9)
  await aggregate((day + 1) * 86_400_000 + 900_000)
  const ten = await published()
  assert.equal(ten.sample, 10)
  assert.equal(ten.firstAccuracy, 10)
  assert.equal(ten.difficulty, null)
  await seedFirstAttempts(10, 29)
  await aggregate((day + 1) * 86_400_000 + 1_200_000)
  assert.equal((await published()).difficulty, '매우 어려움')
  assert.deepEqual((await (await api('/study/recommendations?stage=1&mode=common', { cookie })).json()).numbers, [1])
})
