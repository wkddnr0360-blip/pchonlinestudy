import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { twoFactor } from 'better-auth/plugins/two-factor'
import type { AppEnv } from '../index'
import { isKakaoAccountAddress, mapKakaoProfile } from './kakao'

export const authPath = '/api/v1/auth'

const emailRoutes = new Set([
  'POST /sign-up/email', 'POST /sign-in/email', 'POST /send-verification-email',
  'GET /verify-email', 'POST /request-password-reset', 'POST /reset-password',
])
export const enableMfaPath = authPath + '/two-factor/enable'
export const verifyMfaPath = authPath + '/two-factor/verify-totp'

export function authSettings(env: AppEnv) {
  if (!env.APP_ORIGIN || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) return null
  let origin: URL
  try {
    origin = new URL(env.APP_ORIGIN)
  } catch {
    return null
  }
  if (origin.origin !== env.APP_ORIGIN) return null
  const loopback = env.ONS_ENV === 'local' && ['localhost', '127.0.0.1'].includes(origin.hostname)
  if (origin.protocol !== 'https:' && !(loopback && origin.protocol === 'http:')) return null

  const testMail = loopback && env.AUTH_EMAIL_MODE === 'fixtures'
  const email = testMail || Boolean(env.RESEND_API_KEY && env.MAIL_FROM)
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  const kakao = env.KAKAO_CLIENT_ID && env.KAKAO_CLIENT_SECRET
    ? { clientId: env.KAKAO_CLIENT_ID, clientSecret: env.KAKAO_CLIENT_SECRET } : null
  return { origin: origin.origin, email, google, kakao, testMail }
}

type AuthSettings = NonNullable<ReturnType<typeof authSettings>>

async function sendAccountEmail(env: AppEnv, settings: AuthSettings, kind: 'verify' | 'reset', email: string, url: string, onLocalMail?: (url: string) => void) {
  if (!settings.email || isKakaoAccountAddress(email)) return
  if (settings.testMail) {
    if (!email.endsWith('@example.test')) throw new Error('Synthetic email address required')
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS local_mail_fixtures (kind TEXT, email TEXT, url TEXT NOT NULL, PRIMARY KEY (kind, email))'),
      env.DB.prepare('INSERT INTO local_mail_fixtures (kind, email, url) VALUES (?, ?, ?) ON CONFLICT (kind, email) DO UPDATE SET url = excluded.url')
        .bind(kind, email, url),
    ])
    onLocalMail?.(url)
    return
  }

  const subject = kind === 'verify' ? '박철한 온스 이메일 인증' : '박철한 온스 비밀번호 재설정'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject, text: `${subject}\n\n${url}` }),
  })
  await response.body?.cancel()
  if (!response.ok) throw new Error('Could not send account email')
}

export function createAuth(env: AppEnv, settings: AuthSettings, onLocalMail?: (url: string) => void) {
  return betterAuth({
    appName: '박철한 온스',
    database: env.DB,
    basePath: authPath,
    baseURL: settings.origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [settings.origin],
    logger: { disabled: true },
    onAPIError: { errorURL: `${settings.origin}/account` },
    advanced: { useSecureCookies: settings.origin.startsWith('https:'), ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    verification: { storeIdentifier: 'hashed' },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    plugins: [twoFactor()],
    socialProviders: {
      ...(settings.google ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!,
          disableIdTokenSignIn: true, includeGrantedScopes: false, prompt: 'select_account',
        },
      } : {}),
      ...(settings.kakao ? {
        kakao: {
          ...settings.kakao, disableIdTokenSignIn: true, disableDefaultScope: true,
          scope: ['profile_nickname'], mapProfileToUser: mapKakaoProfile,
        },
      } : {}),
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === '/sign-up/email' && typeof context.body?.email === 'string' && isKakaoAccountAddress(context.body.email)) {
          throw new APIError('BAD_REQUEST', { message: 'Email address is reserved' })
        }
        if (context.path === '/sign-in/social' && context.body?.provider === 'kakao' && context.body.scopes?.length) {
          throw new APIError('BAD_REQUEST', { message: 'Additional Kakao scopes are unavailable' })
        }
      }),
    },
    emailAndPassword: {
      enabled: settings.email,
      autoSignIn: false,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendAccountEmail(env, settings, 'reset', user.email, url, onLocalMail),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 30,
      sendVerificationEmail: async ({ user, url }) => sendAccountEmail(env, settings, 'verify', user.email, url, onLocalMail),
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customStorage: {
        consume: async (key, rule) => {
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
          if (!row) return { allowed: false, retryAfter: rule.window }
          const allowed = row.count <= rule.max
          return { allowed, retryAfter: allowed ? null : Math.ceil((row.expires_at - now) / 1000) }
        },
      },
    },
  })
}

export function authRoute(settings: AuthSettings, method: string, path: string) {
  const route = `${method} ${path.slice(authPath.length)}`
  return route === 'POST /sign-out'
    || (settings.email && method === 'POST' && [enableMfaPath, verifyMfaPath].includes(path))
    || (settings.email && (emailRoutes.has(route) || /^GET \/reset-password\/[a-zA-Z0-9_-]{16,128}$/.test(route)))
    || ((settings.google || settings.kakao !== null) && route === 'POST /sign-in/social')
    || (settings.google && route === 'GET /callback/google')
    || (settings.kakao !== null && route === 'GET /callback/kakao')
}
