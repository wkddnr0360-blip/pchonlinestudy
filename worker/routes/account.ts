import type { AppEnv } from '../index'
import { authPath, authRoute, authSettings, createAuth } from '../auth/config'
import { json, privateHeaders, readSmallJson } from '../http'
import { readMemberAccess, redeemAccessCode } from '../services/book-access'

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
  if (!libraryRoute && path !== sessionPath && path !== redeemPath) return undefined

  const readSession = path === sessionPath && ['GET', 'HEAD'].includes(method)
  const redeem = path === redeemPath && method === 'POST'
  if (!libraryRoute && !readSession && !redeem) return json({ error: 'not_found' }, 404, method)
  if (!settings) return json({ error: readSession ? 'login_required' : 'service_unavailable' }, readSession ? 401 : 503, method)
  if (url.origin !== settings.origin || (method === 'POST' && request.headers.get('Origin') !== settings.origin)) {
    return json({ error: 'forbidden_origin' }, 403, method)
  }

  try {
    const auth = createAuth(env, settings)
    if (libraryRoute) {
      if (!authRoute(settings, method, path)) return json({ error: 'not_found' }, 404, method)
      const response = await auth.handler(request)
      const headers = privateHeaders(response)
      if (response.ok && (path === authPath + '/sign-in/email' || path === authPath + '/sign-up/email')) {
        await response.body?.cancel()
        headers.delete('Content-Length')
        return new Response(JSON.stringify({ ok: true }), { status: response.status, headers })
      }
      return new Response(response.body, { status: response.status, headers })
    }

    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user.emailVerified) return json({ error: 'login_required' }, 401, method)
    const { id, email, name } = session.user
    const suspended = await env.DB.prepare('SELECT 1 FROM member_controls WHERE user_id = ? AND suspended_at IS NOT NULL')
      .bind(id).first()
    if (suspended) return json({ error: 'account_suspended' }, 403, method)

    if (readSession) return json({ user: { id, email, name }, access: await readMemberAccess(env.DB, id, Date.now()) }, 200, method)

    const data = await readSmallJson(request)
    if (typeof data !== 'object' || data === null || !('code' in data) || typeof data.code !== 'string' || data.code.length > 80) {
      return json({ error: 'invalid_input' }, 400)
    }
    const access = await redeemAccessCode(env.DB, id, data.code, Date.now())
    return access ? json({ access }, 200) : json({ error: 'code_unavailable' }, 409)
  } catch {
    return json({ error: 'service_unavailable' }, 503, method)
  }
}
