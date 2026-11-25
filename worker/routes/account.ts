import type { AppEnv } from '../index'
import { getAdminAccess, recordAdminMfa } from '../auth/admin'
import { authPath, authRoute, authSettings, createAuth, enableMfaPath, verifyMfaPath } from '../auth/config'
import { json, privateHeaders, readSmallJson } from '../http'
import { readMemberAccess, redeemAccessCode } from '../services/book-access'
import { adminPrefix, adminPurchaseRoute, memberPurchaseRoute, purchasePath } from './purchases'
import { studyPrefix, studyRoute } from './study'

const sessionPath = '/api/v1/session'
const redeemPath = '/api/v1/book-access/redeem'

export async function accountRoutes(request: Request, env: AppEnv, url: URL): Promise<Response | undefined> {
  const { method } = request
  const path = url.pathname
  const settings = authSettings(env)
  if (method === 'GET' && path === '/api/v1/auth-methods') {
    return json({ email: settings?.email ?? false, google: settings?.google ?? false }, 200)
  }
  const libraryRoute = path.startsWith(authPath + '/')
  const adminRoute = path.startsWith(adminPrefix)
  const purchaseRoute = path === purchasePath
  const study = path.startsWith(studyPrefix)
  if (!libraryRoute && !adminRoute && !purchaseRoute && !study && path !== sessionPath && path !== redeemPath) return undefined

  const readSession = path === sessionPath && ['GET', 'HEAD'].includes(method)
  const redeem = path === redeemPath && method === 'POST'
  if (!libraryRoute && !adminRoute && !purchaseRoute && !study && !readSession && !redeem) return json({ error: 'not_found' }, 404, method)
  if (!settings) return readSession || study ? json({ error: 'login_required' }, 401, method) : json({ error: 'service_unavailable' }, 503, method)
  if (url.origin !== settings.origin || (method === 'POST' && request.headers.get('Origin') !== settings.origin)) {
    return json({ error: 'forbidden_origin' }, 403, method)
  }

  try {
    const auth = createAuth(env, settings)
    if (libraryRoute) {
      if (!authRoute(settings, method, path)) return json({ error: 'not_found' }, 404, method)
      let authRequest = request
      if (path === verifyMfaPath || path === enableMfaPath) {
        const input = await readSmallJson(request)
        const data = input && typeof input === 'object' ? input as Record<string, unknown> : {}
        if (path === enableMfaPath) {
          const session = await auth.api.getSession({ headers: request.headers })
          if (!session?.user.emailVerified) return json({ error: 'login_required' }, 401, method)
          const admin = await getAdminAccess(env.DB, session.user.id, session.session.id, Boolean(session.user.twoFactorEnabled))
          if (!admin || admin.mfaEnabled) return json({ error: 'forbidden' }, 403, method)
          if (typeof data.password !== 'string' || data.password.length > 128) return json({ error: 'invalid_input' }, 400, method)
        } else if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) {
          return json({ error: 'invalid_input' }, 400, method)
        }
        const headers = new Headers(request.headers)
        headers.delete('Content-Length')
        authRequest = new Request(request.url, {
          method, headers, body: JSON.stringify(path === verifyMfaPath ? { code: data.code } : { password: data.password, method: 'totp' }),
        })
      }
      const response = await auth.handler(authRequest)
      const headers = privateHeaders(response)
      const signInRoute = path === authPath + '/sign-in/email'
      if (response.ok && path === enableMfaPath) {
        const { totpURI } = await response.json<{ totpURI?: string }>()
        headers.delete('Content-Length')
        return new Response(JSON.stringify({ totpURI }), { status: response.status, headers })
      }
      if (response.ok && (signInRoute || path === authPath + '/sign-up/email' || path === verifyMfaPath)) {
        const result = await response.json<{ twoFactorRedirect?: boolean; token?: string }>()
        const adminMfa = path === verifyMfaPath && typeof result.token === 'string' && await recordAdminMfa(env.DB, result.token)
        headers.delete('Content-Length')
        return new Response(JSON.stringify({
          ok: true, ...(signInRoute && result.twoFactorRedirect ? { twoFactorRequired: true } : {}),
          ...(path === verifyMfaPath ? { adminMfa } : {}),
        }), { status: response.status, headers })
      }
      return new Response(response.body, { status: response.status, headers })
    }

    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user.emailVerified) return json({ error: 'login_required' }, 401, method)
    const { id, email, name } = session.user
    const suspended = await env.DB.prepare('SELECT 1 FROM member_controls WHERE user_id = ? AND suspended_at IS NOT NULL')
      .bind(id).first()
    if (suspended) return json({ error: 'account_suspended' }, 403, method)
    if (study) return await studyRoute(request, env.DB, url, id)

    const admin = (readSession || adminRoute)
      ? await getAdminAccess(env.DB, id, session.session.id, Boolean(session.user.twoFactorEnabled))
      : null
    if (readSession) return json({ user: { id, email, name }, access: await readMemberAccess(env.DB, id, Date.now()), admin }, 200, method)
    if (adminRoute) {
      if (!admin) return json({ error: 'forbidden' }, 403, method)
      if (!admin.mfaFresh) return json({ error: 'mfa_required' }, 403, method)
      return await adminPurchaseRoute(request, env, url, id)
    }
    if (purchaseRoute) return await memberPurchaseRoute(request, env, id)

    const data = await readSmallJson(request)
    if (typeof data !== 'object' || data === null || !('code' in data) || typeof data.code !== 'string' || data.code.length > 80) {
      return json({ error: 'invalid_input' }, 400)
    }
    const redemption = await redeemAccessCode(env.DB, id, data.code, Date.now())
    return redemption ? json(redemption, 200) : json({ error: 'code_unavailable' }, 409)
  } catch {
    return json({ error: 'service_unavailable' }, 503, method)
  }
}
