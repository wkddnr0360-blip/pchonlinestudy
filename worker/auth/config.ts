import { betterAuth } from 'better-auth'
import { addOAuthServerContext, APIError, createAuthMiddleware, getOAuthState } from 'better-auth/api'
import { twoFactor } from 'better-auth/plugins/two-factor'
import type { AppEnv } from '../index'
import { isKakaoAccountAddress, mapKakaoProfile } from './kakao'
import { consumeAuthLimit } from './rate-limit'
import { readSignupState, type RegistrationConfirmation } from './registration'
import { isUsernameAccountAddress, usernameSignIn, usernameSignUp } from './username'

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
  if (!settings.email || isKakaoAccountAddress(email) || isUsernameAccountAddress(email)) return
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

export function createAuth(env: AppEnv, settings: AuthSettings, options: {
  onLocalMail?: (url: string) => void
  usernameLogin?: boolean
  passwordChange?: boolean
  registration?: RegistrationConfirmation
} = {}) {
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
    user: {
      additionalFields: {
        registrationTermsVersion: { type: 'string', required: false, input: false, returned: false },
        registrationConfirmedAt: { type: 'number', required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: { create: { before: async (user, context) => {
        const accepted = context?.path === '/sign-up/email' ? options.registration
          : readSignupState((await getOAuthState())?.serverContext?.registration)
        if (!accepted || env.ONS_ENV === 'production') {
          throw new APIError('BAD_REQUEST', { code: 'signup_confirmation_required', message: 'Sign-up confirmation is required' })
        }
        return { data: { ...user, ...accepted } }
      } } },
    },
    plugins: [twoFactor({ allowPasswordless: true })],
    socialProviders: {
      ...(settings.google ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!,
          disableIdTokenSignIn: true, disableImplicitSignUp: true, includeGrantedScopes: false, prompt: 'select_account',
        },
      } : {}),
      ...(settings.kakao ? {
        kakao: {
          ...settings.kakao, disableIdTokenSignIn: true, disableImplicitSignUp: true, disableDefaultScope: true,
          scope: ['profile_nickname'], mapProfileToUser: mapKakaoProfile,
        },
      } : {}),
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        const email = context.body?.email
        if (typeof email === 'string' && (isKakaoAccountAddress(email) || isUsernameAccountAddress(email))) {
          if (!(options.usernameLogin && context.path === '/sign-in/email' && isUsernameAccountAddress(email))) {
            throw new APIError('BAD_REQUEST', { message: 'Email address is reserved' })
          }
        }
        if (context.path === '/sign-in/social' && context.body?.provider === 'kakao' && context.body.scopes?.length) {
          throw new APIError('BAD_REQUEST', { message: 'Additional Kakao scopes are unavailable' })
        }
        if (context.path === '/sign-in/social' && context.body?.requestSignUp === true && options.registration) {
          await addOAuthServerContext({ registration: options.registration })
        }
      }),
    },
    emailAndPassword: {
      enabled: settings.email || Boolean(options.usernameLogin || options.passwordChange),
      autoSignIn: false,
      requireEmailVerification: !options.usernameLogin,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendAccountEmail(env, settings, 'reset', user.email, url, options.onLocalMail),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 30,
      sendVerificationEmail: async ({ user, url }) => sendAccountEmail(env, settings, 'verify', user.email, url, options.onLocalMail),
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customStorage: {
        consume: (key, rule) => consumeAuthLimit(env, key, rule),
      },
    },
  })
}

export function authRoute(settings: AuthSettings, method: string, path: string) {
  const route = `${method} ${path.slice(authPath.length)}`
  return route === 'POST /sign-out'
    || (method === 'POST' && (path === authPath + usernameSignIn || path === authPath + usernameSignUp))
    || (method === 'POST' && [enableMfaPath, verifyMfaPath].includes(path))
    || (settings.email && (emailRoutes.has(route) || /^GET \/reset-password\/[a-zA-Z0-9_-]{16,128}$/.test(route)))
    || ((settings.google || settings.kakao !== null) && route === 'POST /sign-in/social')
    || (settings.google && route === 'GET /callback/google')
    || (settings.kakao !== null && route === 'GET /callback/kakao')
}
