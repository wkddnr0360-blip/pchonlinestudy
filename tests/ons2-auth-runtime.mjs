import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
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

function api(path, { body, cookie, sentOrigin = origin, ip = '192.0.2.11' } = {}) {
  const headers = new Headers({ 'CF-Connecting-IP': ip })
  if (cookie) headers.set('Cookie', cookie)
  if (body) {
    headers.set('Content-Type', 'application/json')
    headers.set('Origin', sentOrigin)
  }
  return harness.fetch(origin + '/api/v1' + path, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
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
