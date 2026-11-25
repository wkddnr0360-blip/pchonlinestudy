import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { encode } from 'jpeg-js'
import { createTestHarness } from 'wrangler'

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
  const message = await env.PRIVATE_FILES.get('test-mail/verify/' + email)
  assert.ok(message, 'local synthetic verification message was delivered')
  return harness.fetch(await message.text(), { redirect: 'manual' })
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
})

after(async () => { await harness.close() })
beforeEach(async () => { await env.DB.prepare('DELETE FROM auth_rate_limits').run() })

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
  const message = await env.PRIVATE_FILES.get('test-mail/reset/' + email)
  assert.ok(message)
  const callback = await harness.fetch(await message.text(), { redirect: 'manual' })
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
  await env.DB.prepare('UPDATE book_campaigns SET ends_at = ? WHERE id = ?').bind(Date.now(), campaign).run()
  assert.equal((await (await api('/session', { cookie: owner.cookie })).json()).access.bookVerified, false)
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

  const jpeg = encode({ width: 200, height: 200, data: Buffer.alloc(200 * 200 * 4, 128) }, 75).data
  const embedded = Buffer.from('fixture-photo-metadata', 'utf8')
  const appSegment = Buffer.from([0xff, 0xe1, 0, embedded.length + 2])
  const photo = Buffer.concat([jpeg.subarray(0, 2), appSegment, embedded, jpeg.subarray(2)])
  const form = new FormData()
  form.set('nickname', '합성 카페 회원')
  form.set('photo', new Blob([photo], { type: 'image/jpeg' }), 'fixture.jpg')
  const submitted = await api('/purchase', { cookie: memberCookie, body: form })
  assert.equal(submitted.status, 201, await submitted.clone().text())
  const { purchase } = await submitted.json()
  assert.equal(purchase.status, 'pending')
  assert.equal((await api('/purchase', { cookie: memberCookie, body: form })).status, 409)
  const adminRequest = `/admin/purchases/${purchase.id}`
  assert.equal((await api(adminRequest + '/photo', { cookie: memberCookie })).status, 403)
  assert.equal((await harness.fetch(`${origin}/verification/${purchase.id}.jpg`)).status, 404)
  const savedPhoto = await api(adminRequest + '/photo', { cookie: adminCookie })
  assert.equal(savedPhoto.status, 200)
  assert.equal(savedPhoto.headers.get('cache-control'), 'private, no-store')
  assert.equal(Buffer.from(await savedPhoto.arrayBuffer()).includes(embedded), false)
  assert.equal((await api(adminRequest + '/ticket', { body: { expectedTicketId: null }, cookie: adminCookie })).status, 409)

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
  const history = await (await api(adminRequest + '/tickets', { cookie: adminCookie })).json()
  assert.equal(history.tickets.length, 2)
  assert.ok(history.tickets.find((ticket) => ticket.id === first.ticket.id).revokedAt)
  assert.ok(history.tickets.find((ticket) => ticket.id === second.ticket.id).redeemedAt)
  assert.equal((await api(`/admin/tickets/${second.ticket.id}/revoke`, { body: {}, cookie: adminCookie })).status, 409)
  const now = Date.now()
  await env.DB.prepare('UPDATE purchase_requests SET reviewed_at = ? WHERE id = ?').bind(now - 31 * 86400 * 1000, purchase.id).run()
  const cleanup = await worker.scheduled({ cron: '0 18 * * *', scheduledTime: new Date(now) })
  assert.equal(cleanup.outcome, 'ok')
  assert.equal((await api(adminRequest + '/photo', { cookie: adminCookie })).status, 404)
  assert.ok(await env.DB.prepare("SELECT 1 FROM audit_events WHERE target_id = ? AND action = 'purchase_photo_purged'").bind(purchase.id).first())
  await env.DB.prepare('UPDATE admin_mfa SET verified_at = ?').bind(now - 16 * 60 * 1000).run()
  assert.equal((await requestQueue(adminCookie)).status, 403)
  await env.DB.prepare('DELETE FROM member_roles WHERE user_id = ?').bind(session.user.id).run()
  assert.equal((await requestQueue(adminCookie)).status, 403)
})
