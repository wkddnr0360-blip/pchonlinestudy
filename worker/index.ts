import { json } from './http'
import { fingerprintedAsset } from '../shared/static-assets'
import { accountRoutes } from './routes/account'
import { legacyCacheRoute } from './routes/legacy-cache'
import { purgeReviewedPhotos } from './jobs/purchase-photos'

export interface AppEnv {
  ONS_ENV: 'local' | 'staging' | 'production'
  ASSETS: Fetcher
  DB: D1Database
  PRIVATE_FILES: R2Bucket
  APP_ORIGIN?: string
  BETTER_AUTH_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  AUTH_EMAIL_MODE?: string
  LEGACY_PAGES_CACHE_MIGRATION?: string
  PURCHASE_TICKET_TTL_HOURS?: string
  PURCHASE_PHOTO_RETENTION_DAYS?: string
}

export default {
  async scheduled(event, env) {
    await purgeReviewedPhotos(env, event.scheduledTime)
  },
  async fetch(request, env) {
    const url = new URL(request.url)
    const { method } = request

    if (!env.ASSETS || !env.DB || !env.PRIVATE_FILES || !['local', 'staging', 'production'].includes(env.ONS_ENV)) {
      return json({ error: 'service_unavailable' }, 503, method)
    }

    const read = method === 'GET' || method === 'HEAD'
    if (read && url.pathname === '/api/v1/health') {
      return json({ ok: true }, 200, method)
    }
    const account = await accountRoutes(request, env, url)
    if (account) return account
    const migration = await legacyCacheRoute(request, env, url)
    if (migration) return migration

    const isShell = url.pathname === '/' || url.pathname === '/account' || url.pathname === '/admin'
    if (!read || (!isShell && !fingerprintedAsset.test(url.pathname.slice(1)))) {
      return json({ error: 'not_found' }, 404, method)
    }

    const assetRequest = isShell ? new Request(new URL('/', url), { method }) : request
    const asset = await env.ASSETS.fetch(assetRequest)
    if (asset.status >= 400) return json({ error: 'not_found' }, 404, method)

    const response = new Response(asset.body, asset)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    if (isShell) {
      response.headers.set('Cache-Control', 'no-store')
      response.headers.set('Referrer-Policy', 'no-referrer')
      response.headers.set('Content-Security-Policy', [
        "default-src 'self'", "img-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
      ].join('; '))
    } else if (asset.status === 200 || asset.status === 304) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    }
    return response
  },
} satisfies ExportedHandler<AppEnv>
