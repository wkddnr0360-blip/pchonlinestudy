import type { AppEnv } from '../index'
import { getAdminAccess, recordAdminMfa } from '../auth/admin'
import { authPath, authRoute, authSettings, createAuth, enableMfaPath, verifyMfaPath } from '../auth/config'
import { isKakaoAccountAddress } from '../auth/kakao'
import { isUsernameAccountAddress, readUsernameCredentials, registerUsername, usernameSignIn, usernameSignUp } from '../auth/username'
import { withdrawMember } from '../auth/withdraw'
import { json, privateHeaders, readSmallJson } from '../http'
import { readMemberAccess, redeemAccessCode } from '../services/book-access'
import { adminPrefix, adminPurchaseRoute, memberPurchaseRoute, purchasePath } from './purchases'
import { studyPrefix, studyRoute } from './study'
import { statisticsAdminPath, statisticsAdminRoute } from './analytics'
import { examPrefix, examRoute } from './exams'

const sessionPath = '/api/v1/session'
const redeemPath = '/api/v1/book-access/redeem'
const withdrawPath = '/api/v1/account/withdraw'

export async function accountRoutes(request: Request, env: AppEnv, url: URL): Promise<Response | undefined> {
  const { method } = request
  const path = url.pathname
  const settings = authSettings(env)
  if (method === 'GET' && path === '/api/v1/auth-methods') {
    return json({ email: settings?.email ?? false, google: settings?.google ?? false, kakao: Boolean(settings?.kakao), username: Boolean(settings), ...(settings?.testMail ? { localMail: true } : {}) }, 200)
  }
  const libraryRoute = path.startsWith(authPath + '/')
  const adminRoute = path.startsWith(adminPrefix)
  const purchaseRoute = path === purchasePath
  const study = path.startsWith(studyPrefix)
  const exam = path.startsWith(examPrefix)
  if (!libraryRoute && !adminRoute && !purchaseRoute && !study && !exam && path !== sessionPath && path !== redeemPath && path !== withdrawPath) return undefined

  const readSession = path === sessionPath && ['GET', 'HEAD'].includes(method)
  const redeem = path === redeemPath && method === 'POST'
  const withdraw = path === withdrawPath && method === 'POST'
  if (!libraryRoute && !adminRoute && !purchaseRoute && !study && !exam && !readSession && !redeem && !withdraw) return json({ error: 'not_found' }, 404, method)
  if (!settings) return readSession || study || exam ? json({ error: 'login_required' }, 401, method) : json({ error: 'service_unavailable' }, 503, method)
  if (url.origin !== settings.origin || (method === 'POST' && request.headers.get('Origin') !== settings.origin)) {
    return json({ error: 'forbidden_origin' }, 403, method)
  }

  try {
    if (libraryRoute && !authRoute(settings, method, path)) return json({ error: 'not_found' }, 404, method)
    if (path === authPath + usernameSignUp) return await registerUsername(request, env)
    const usernameLogin = path === authPath + usernameSignIn
    let localMailLink: string | undefined
    const auth = createAuth(env, settings, {
      usernameLogin, onLocalMail: settings.testMail ? (link) => { localMailLink = link } : undefined,
    })
    if (libraryRoute) {
      let authRequest = request
      if (usernameLogin) {
        const credentials = await readUsernameCredentials(request)
        if (!credentials) return json({ error: 'invalid_input' }, 400)
        const headers = new Headers(request.headers)
        headers.delete('Content-Length')
        authRequest = new Request(`${settings.origin}${authPath}/sign-in/email`, {
          method, headers, body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        })
      }
      if (path === verifyMfaPath || path === enableMfaPath) {
        const input = await readSmallJson(request)
        const data = input && typeof input === 'object' ? input as Record<string, unknown> : {}
        if (path === enableMfaPath) {
          const session = await auth.api.getSession({ headers: request.headers })
          if (!session?.user.emailVerified) return json({ error: 'login_required' }, 401, method)
          const admin = await getAdminAccess(env.DB, session.user.id, session.session.id, Boolean(session.user.twoFactorEnabled))
          if (!admin || admin.mfaEnabled) return json({ error: 'forbidden' }, 403, method)
          if (admin.passwordRequired && (typeof data.password !== 'string' || data.password.length > 128)) return json({ error: 'invalid_input' }, 400, method)
          if (!admin.passwordRequired && Date.now() - session.session.createdAt.getTime() > 10 * 60 * 1000) {
            return json({ error: 'reauth_required' }, 409, method)
          }
        } else if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) {
          return json({ error: 'invalid_input' }, 400, method)
        }
        const headers = new Headers(request.headers)
        headers.delete('Content-Length')
        authRequest = new Request(request.url, {
          method, headers, body: JSON.stringify(path === verifyMfaPath ? { code: data.code } : { password: data.password ?? undefined, method: 'totp' }),
        })
      }
      const response = await auth.handler(authRequest)
      const headers = privateHeaders(response)
      const signInRoute = usernameLogin || path === authPath + '/sign-in/email'
      if (response.ok && path === enableMfaPath) {
        const { totpURI } = await response.json<{ totpURI?: string }>()
        headers.delete('Content-Length')
        return new Response(JSON.stringify({ totpURI }), { status: response.status, headers })
      }
      if (response.ok && (signInRoute || path === authPath + '/sign-up/email' || path === verifyMfaPath || localMailLink)) {
        const result = await response.json<{ twoFactorRedirect?: boolean; token?: string }>()
        let adminMfa = false
        if (path === verifyMfaPath) {
          const sessionCookie = headers.getSetCookie().find((cookie) => /session_token=[^;]/.test(cookie))?.split(';')[0]
          const freshSession = sessionCookie ? await auth.api.getSession({ headers: new Headers({ Cookie: sessionCookie }) }) : null
          const token = freshSession?.session.token ?? result.token
          adminMfa = typeof token === 'string' && await recordAdminMfa(env.DB, token)
        }
        headers.delete('Content-Length')
        return new Response(JSON.stringify({
          ok: true, ...(signInRoute && result.twoFactorRedirect ? { twoFactorRequired: true } : {}),
          ...(localMailLink ? { localMailLink } : {}),
          ...(path === verifyMfaPath ? { adminMfa } : {}),
        }), { status: response.status, headers })
      }
      return new Response(response.body, { status: response.status, headers })
    }

    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return json({ error: 'login_required' }, 401, method)
    const { id, email, name } = session.user
    const kakaoMember = isKakaoAccountAddress(email)
    const username = isUsernameAccountAddress(email) ? email.slice(0, email.indexOf('@')) : null
    const accountProvider = kakaoMember ? 'kakao' : username ? 'credential' : null
    const verified = accountProvider
      ? await env.DB.prepare('SELECT id FROM account WHERE userId = ? AND providerId = ?').bind(id, accountProvider).first<{ id: string }>()
      : session.user.emailVerified
    if (!verified) return json({ error: 'login_required' }, 401, method)
    if (withdraw) return await withdrawMember(request, env, id, session.session.createdAt, kakaoMember && typeof verified === 'object'
      ? async () => (await auth.api.getAccessToken({ headers: request.headers, body: { accountId: verified.id } })).accessToken
      : undefined)
    const suspended = await env.DB.prepare('SELECT 1 FROM member_controls WHERE user_id = ? AND suspended_at IS NOT NULL')
      .bind(id).first()
    if (suspended) return json({ error: 'account_suspended' }, 403, method)
    if (study) return await studyRoute(request, env, url, id)
    if (exam) return await examRoute(request, env.DB, url, id)

    const admin = !accountProvider && (readSession || adminRoute)
      ? await getAdminAccess(env.DB, id, session.session.id, Boolean(session.user.twoFactorEnabled))
      : null
    if (readSession) return json({ user: { id, email: accountProvider ? null : email, name, ...(username ? { username } : {}) }, access: await readMemberAccess(env.DB, id, Date.now()), admin }, 200, method)
    if (adminRoute) {
      if (!admin) return json({ error: 'forbidden' }, 403, method)
      if (!admin.mfaFresh) return json({ error: 'mfa_required' }, 403, method)
      if (path === statisticsAdminPath || path.startsWith(statisticsAdminPath + '/')) {
        return await statisticsAdminRoute(request, env, url, id)
      }
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
