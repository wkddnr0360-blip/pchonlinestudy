import { hashPassword } from 'better-auth/crypto'
import type { AppEnv } from '../index'
import { json, readSmallJson } from '../http'
import { consumeAuthLimit } from './rate-limit'
import { acceptSignup } from './registration'

const loginDomain = '@id.ons.invalid'
const validUsername = /^[a-z0-9][a-z0-9._-]{3,23}$/
export const usernameSignIn = '/sign-in/username'
export const usernameSignUp = '/sign-up/username'

export function isUsernameAccountAddress(email: string) {
  return email.toLowerCase().endsWith(loginDomain)
}

function usernameCredentials(input: Record<string, unknown>) {
  const { username: rawUsername, password, name: rawName } = input
  const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : ''
  const name = typeof rawName === 'string' ? rawName.trim() || username : username
  if (!validUsername.test(username) || typeof password !== 'string' || !password.trim() || password.length > 128 || name.length > 60) return null
  return { email: username + loginDomain, password, name }
}

export async function readUsernameCredentials(request: Request) {
  const input = await readSmallJson(request, 2048)
  return input && typeof input === 'object' ? usernameCredentials(input as Record<string, unknown>) : null
}

export async function registerUsername(request: Request, env: AppEnv) {
  const raw = await readSmallJson(request, 2048)
  if (!raw || typeof raw !== 'object') return json({ error: 'invalid_input' }, 400)
  const input = raw as Record<string, unknown>
  const confirmation = acceptSignup(env, input)
  if (!confirmation) return json({ error: 'signup_confirmation_required' }, 400)
  const credentials = usernameCredentials(input)
  if (!credentials || credentials.password.length < 12) return json({ error: 'invalid_input' }, 400)
  if (typeof input.name !== 'string' || !input.name.trim()) return json({ error: 'nickname_required' }, 400)
  if (input.passwordConfirmation !== credentials.password) return json({ error: 'password_mismatch' }, 400)

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const limit = await consumeAuthLimit(env, `username-sign-up:${ip}`, { window: 60, max: 5 })
  if (!limit.allowed) {
    const response = json({ error: 'too_many_requests' }, 429)
    if (limit.retryAfter !== null) response.headers.set('Retry-After', String(limit.retryAfter))
    return response
  }

  const id = crypto.randomUUID()
  const at = new Date().toISOString()
  const passwordHash = await hashPassword(credentials.password)
  // D1 commits both inserts together. A concurrent duplicate leaves both records untouched.
  const [user] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO user (id, name, email, createdAt, updatedAt, registrationTermsVersion, registrationConfirmedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO NOTHING
    `).bind(id, credentials.name, credentials.email, at, at, confirmation.registrationTermsVersion, confirmation.registrationConfirmedAt),
    env.DB.prepare(`
      INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
      SELECT ?, user.id, 'credential', user.id, ?, ?, ? FROM user WHERE user.id = ?
    `).bind(crypto.randomUUID(), passwordHash, at, at, id),
  ])
  return user.meta.changes === 1 ? json({ ok: true }, 201) : json({ error: 'username_taken' }, 409)
}
