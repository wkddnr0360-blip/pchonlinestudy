import type { AppEnv } from '../index'

export async function consumeAuthLimit(env: AppEnv, key: string, rule: { window: number; max: number }) {
  const now = Date.now()
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${key}`))
  const id = Array.from(new Uint8Array(hashed), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const row = await env.DB.prepare(`
    INSERT INTO auth_rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING count, expires_at
  `).bind(id, now + rule.window * 1000, now, now).first<{ count: number; expires_at: number }>()
  if (!row) return { allowed: false, retryAfter: null }
  const allowed = row.count <= rule.max
  return { allowed, retryAfter: allowed ? null : Math.ceil((row.expires_at - now) / 1000) }
}
