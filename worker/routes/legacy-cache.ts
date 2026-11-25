import type { AppEnv } from '../index'
import { privateHeaders } from '../http'

const legacyWorkerUrl = /^\/sw(?:-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?\.js$/

// Old Pages tabs send SKIP_WAITING through their update button after the exam guard.
const retireWorker = `
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const legacyNames = (await caches.keys()).filter((name) =>
      name === 'police-ox-book' ||
      (/^(ons-[a-f0-9-]{36}|workbox)-precache-v2-/.test(name) && name.endsWith('-' + scope))
    );
    await Promise.all(legacyNames.map((name) => caches.delete(name)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
`

export async function legacyCacheRoute(request: Request, env: AppEnv, url: URL): Promise<Response | undefined> {
  if (env.LEGACY_PAGES_CACHE_MIGRATION !== '1' || !['GET', 'HEAD'].includes(request.method)) return undefined
  if (url.pathname === '/release.json') {
    const marker = await env.ASSETS.fetch(new Request(new URL('/release.json', url), { method: request.method }))
    if (marker.ok) return new Response(marker.body, { status: marker.status, headers: privateHeaders(marker) })
  }
  if (legacyWorkerUrl.test(url.pathname)) {
    const response = new Response(request.method === 'HEAD' ? null : retireWorker, {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
    })
    return new Response(response.body, { headers: privateHeaders(response) })
  }
  return undefined
}
