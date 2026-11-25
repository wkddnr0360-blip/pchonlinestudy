import { json, readSmallJson } from '../http'
import type { AppEnv } from '../index'
import { consumeAuthLimit } from './rate-limit'

export async function changeProfile(request: Request, env: AppEnv, userId: string) {
  const data = await readSmallJson(request)
  const name = data && typeof data === 'object' && 'name' in data && typeof data.name === 'string' ? data.name.trim() : ''
  if (!name || name.length > 60 || /[\p{Cc}]/u.test(name)) return json({ error: 'invalid_nickname' }, 400)
  const limit = await consumeAuthLimit(env, 'profile:' + userId, { window: 60, max: 8 })
  if (!limit.allowed) return json({ error: 'too_many_requests' }, 429)
  const user = await env.DB.prepare('UPDATE user SET name = ?, updatedAt = ? WHERE id = ? RETURNING name')
    .bind(name, new Date().toISOString(), userId).first<{ name: string }>()
  return user ? json(user, 200) : json({ error: 'login_required' }, 401)
}

export async function withPasswordChange(request: Request, env: AppEnv, userId: string,
  change: (currentPassword: string, newPassword: string) => Promise<Response>) {
  const data = await readSmallJson(request, 2048)
  if (!data || typeof data !== 'object') return json({ error: 'invalid_password' }, 400)
  const { currentPassword, newPassword, passwordConfirmation } = data as Record<string, unknown>
  if (typeof currentPassword !== 'string' || !currentPassword.trim() || currentPassword.length > 128
    || typeof newPassword !== 'string' || !newPassword.trim() || newPassword.length < 12 || newPassword.length > 128
    || newPassword !== passwordConfirmation || newPassword === currentPassword) return json({ error: 'invalid_password' }, 400)
  const limit = await consumeAuthLimit(env, 'password-change:' + userId, { window: 60, max: 5 })
  if (!limit.allowed) return json({ error: 'too_many_requests' }, 429)
  const result = await change(currentPassword, newPassword)
  if (!result.ok) return json({ error: 'password_change_failed' }, result.status)
  const response = json({ ok: true }, 200)
  for (const cookie of result.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie)
  return response
}
