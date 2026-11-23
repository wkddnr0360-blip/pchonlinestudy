// Cloudflare Worker: 유료 콘텐츠는 R2 비공개 버킷에서만 전송한다.
// ADMIN_SECRET은 반드시 wrangler secret으로만 설정한다.
const encoder = new TextEncoder()
const SESSION_SECONDS = 60 * 60 * 24 * 30
const PBKDF2_ROUNDS = 210000

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
function unhex(value) {
  return new Uint8Array(value.match(/../g).map((byte) => Number.parseInt(byte, 16)))
}
function secret(length = 32) {
  return crypto.getRandomValues(new Uint8Array(length))
}
async function digest(input) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input))))
}
async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  return hex(new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unhex(salt), iterations: PBKDF2_ROUNDS, hash: 'SHA-256' }, key, 256,
  )))
}
function equals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let different = 0
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return different === 0
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
async function body(request) {
  if (Number(request.headers.get('Content-Length') ?? 0) > 4096) throw new Error('요청이 너무 큽니다.')
  const text = await request.text()
  if (text.length > 4096) throw new Error('요청이 너무 큽니다.')
  return JSON.parse(text)
}
function bearer(request) {
  const value = request.headers.get('Authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}
async function userFrom(request, env) {
  const token = bearer(request)
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const hash = await digest(token)
  return env.DB.prepare(
    'SELECT users.id, users.email, users.premium FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
  ).bind(hash, Date.now()).first()
}
async function establish(user, env) {
  const token = hex(secret())
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await digest(token), user.id, Date.now() + SESSION_SECONDS * 1000).run()
  return json({ token, email: user.email, premium: Boolean(user.premium) })
}
async function rateLimit(request, env, endpoint) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const key = await digest(endpoint + ':' + ip)
  const now = Date.now()
  await env.DB.prepare(
    'INSERT INTO auth_limits (key, attempts, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN reset_at <= ? THEN 1 ELSE attempts + 1 END, reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END',
  ).bind(key, now + 3600000, now, now).run()
  const item = await env.DB.prepare('SELECT attempts FROM auth_limits WHERE key = ?').bind(key).first()
  return item.attempts <= 20
}
async function register(request, env) {
  if (!await rateLimit(request, env, 'register')) return json({ error: '잠시 후 다시 시도해 주세요.' }, 429)
  const input = await body(request)
  const email = String(input.email ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
    return json({ error: '이메일과 12~128자 비밀번호를 입력해 주세요.' }, 400)
  }
  const salt = hex(secret(16))
  const user = { id: crypto.randomUUID(), email, premium: 0 }
  try {
    await env.DB.prepare('INSERT INTO users (id, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, email, salt, await passwordDigest(password, salt), Date.now()).run()
  } catch {
    return json({ error: '이미 가입된 이메일이거나 가입을 완료하지 못했습니다.' }, 409)
  }
  return establish(user, env)
}
async function login(request, env) {
  if (!await rateLimit(request, env, 'login')) return json({ error: '잠시 후 다시 시도해 주세요.' }, 429)
  const input = await body(request)
  const email = String(input.email ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  if (email.length > 254 || password.length > 128) return json({ error: '로그인 정보가 올바르지 않습니다.' }, 401)
  const user = await env.DB.prepare('SELECT id,email,salt,password_hash,premium FROM users WHERE email = ?').bind(email).first()
  if (!user || !equals(await passwordDigest(password, user.salt), user.password_hash)) {
    return json({ error: '로그인 정보가 올바르지 않습니다.' }, 401)
  }
  return establish(user, env)
}
async function redeem(request, env, user) {
  if (user.premium) return json({ premium: true, message: '이미 전체 이용권이 등록되어 있습니다.' })
  const input = await body(request)
  const code = String(input.code ?? '').trim().toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-F0-9]{32}$/.test(code)) return json({ error: '코드 형식을 확인해 주세요.' }, 400)
  const codeHash = await digest(code)
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE codes SET redeemed_by = ?, redeemed_at = ? WHERE code_hash = ? AND redeemed_by IS NULL RETURNING code_hash')
      .bind(user.id, Date.now(), codeHash),
    env.DB.prepare('UPDATE users SET premium = 1 WHERE id = ? AND EXISTS (SELECT 1 FROM codes WHERE code_hash = ? AND redeemed_by = ?)')
      .bind(user.id, codeHash, user.id),
  ])
  if (!results[0].results?.length) return json({ error: '잘못되었거나 이미 사용된 코드입니다.' }, 409)
  return json({ premium: true })
}
async function issue(request, env) {
  if (!env.ADMIN_SECRET || !equals(bearer(request), env.ADMIN_SECRET)) return json({ error: '권한이 없습니다.' }, 403)
  const input = await body(request)
  const count = Number(input.count)
  if (!Number.isInteger(count) || count < 1 || count > 100) return json({ error: '1~100개를 입력해 주세요.' }, 400)
  const codes = Array.from({ length: count }, () => hex(secret(16)).toUpperCase())
  await env.DB.batch(await Promise.all(codes.map(async (code) =>
    env.DB.prepare('INSERT INTO codes (code_hash, created_at) VALUES (?, ?)').bind(await digest(code), Date.now())
  )))
  return json({ codes, note: '원본 코드는 이번 응답에서만 볼 수 있습니다. 안전하게 보관하세요.' })
}
async function premiumBook(env, user, version, key) {
  if (!user.premium) return json({ error: '유료 이용권이 필요합니다.' }, 403)
  if (version !== env.BOOK_VERSION || !/^[23]-[12]-[1-7]$/.test(key)) {
    return json({ error: '교재를 찾을 수 없습니다.' }, 404)
  }
  const object = await env.BOOK.get('book/' + version + '/' + key + '.json')
  if (!object) return json({ error: '교재 데이터를 준비 중입니다.' }, 404)
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const allowed = env.ALLOWED_ORIGIN
    if (origin && origin !== allowed) return json({ error: '허용되지 않은 출처입니다.' }, 403)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowed,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        },
      })
    }
    let response
    try {
      const path = new URL(request.url).pathname
      if (request.method === 'POST' && path === '/auth/register') response = await register(request, env)
      else if (request.method === 'POST' && path === '/auth/login') response = await login(request, env)
      else if (request.method === 'POST' && path === '/admin/codes') response = await issue(request, env)
      else {
        const user = await userFrom(request, env)
        if (!user) response = json({ error: '로그인이 필요합니다.' }, 401)
        else if (request.method === 'GET' && path === '/auth/me') {
          response = json({ email: user.email, premium: Boolean(user.premium) })
        } else if (request.method === 'POST' && path === '/auth/logout') {
          await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(bearer(request))).run()
          response = json({ ok: true })
        } else if (request.method === 'POST' && path === '/license/redeem') response = await redeem(request, env, user)
        else if (request.method === 'GET' && /^\/book\/[0-9a-f]{16}\/[23]-[12]-[1-7]$/.test(path)) {
          const [, , version, key] = path.split('/')
          response = await premiumBook(env, user, version, key)
        } else response = json({ error: '없는 경로입니다.' }, 404)
      }
    } catch (error) {
      if (error instanceof SyntaxError) response = json({ error: '요청 형식을 확인해 주세요.' }, 400)
      else response = json({ error: '처리 중 오류가 발생했습니다.' }, 500)
    }
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', allowed)
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    headers.set('Vary', 'Origin')
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  },
}
