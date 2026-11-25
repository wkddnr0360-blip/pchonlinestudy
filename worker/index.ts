import { json } from './http'
import { fingerprintedAsset } from '../shared/static-assets'

export interface AppEnv {
  ONS_ENV: 'local' | 'staging' | 'production'
  ASSETS: Fetcher
  DB: D1Database
  PRIVATE_FILES: R2Bucket
}

export default {
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
    if (read && url.pathname === '/api/v1/session') {
      return json({ error: 'login_required' }, 401, method)
    }

    const isShell = url.pathname === '/'
    if (!read || (!isShell && !fingerprintedAsset.test(url.pathname.slice(1)))) {
      return json({ error: 'not_found' }, 404, method)
    }

    const asset = await env.ASSETS.fetch(request)
    if (asset.status >= 400) return json({ error: 'not_found' }, 404, method)

    const response = new Response(asset.body, asset)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    if (isShell) {
      response.headers.set('Cache-Control', 'no-store')
      response.headers.set('Content-Security-Policy', [
        "default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
      ].join('; '))
    }
    return response
  },
} satisfies ExportedHandler<AppEnv>
