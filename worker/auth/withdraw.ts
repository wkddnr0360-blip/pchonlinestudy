import type { AppEnv } from '../index'
import { json, readSmallJson } from '../http'

const recentLoginMs = 10 * 60 * 1000

export async function withdrawMember(
  request: Request, env: AppEnv, userId: string, signedInAt: Date, getKakaoToken?: () => Promise<string | undefined>,
) {
  const body = await readSmallJson(request)
  if (!body || typeof body !== 'object' || !('confirm' in body) || body.confirm !== '회원탈퇴') {
    return json({ error: 'confirmation_required' }, 400)
  }
  const age = Date.now() - signedInAt.getTime()
  if (!Number.isFinite(age) || age < 0 || age > recentLoginMs) return json({ error: 'reauth_required' }, 409)

  const isAdmin = await env.DB.prepare("SELECT 1 FROM member_roles WHERE user_id = ? AND role = 'admin'").bind(userId).first()
  if (isAdmin) return json({ error: 'admin_withdrawal_unavailable' }, 403)

  if (getKakaoToken) {
    try {
      const token = await getKakaoToken()
      if (!token) return json({ error: 'reauth_required' }, 409)
      const unlink = await fetch('https://kapi.kakao.com/v1/user/unlink', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(5000),
      })
      await unlink.body?.cancel()
      if (unlink.status === 401) return json({ error: 'reauth_required' }, 409)
      if (!unlink.ok) return json({ error: 'provider_unavailable' }, 503)
    } catch {
      return json({ error: 'provider_unavailable' }, 503)
    }
  }

  // Sessions, OAuth credentials, purchase evidence, entitlements and progress cascade from the user row.
  const deleted = await env.DB.prepare(`
    DELETE FROM user WHERE id = ? AND NOT EXISTS (
      SELECT 1 FROM member_roles WHERE user_id = ? AND role = 'admin'
    )
    RETURNING id
  `).bind(userId, userId).first('id')
  return deleted ? json({ ok: true }, 200) : json({ error: 'withdrawal_unavailable' }, 409)
}
