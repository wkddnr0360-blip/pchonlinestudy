export interface BuildInfo {
  id: string
  builtAt: number
}

declare const __ONS_BUILD__: BuildInfo

const current = __ONS_BUILD__
const base = new URL(import.meta.env.BASE_URL, window.location.origin)
const interval = 3 * 60 * 1000

export { base, current, interval }

function validBuild(value: unknown): value is BuildInfo {
  if (!value || typeof value !== 'object') return false
  const build = value as Partial<BuildInfo>
  return typeof build.id === 'string' && /^[a-f0-9-]{36}$/.test(build.id)
    && typeof build.builtAt === 'number' && Number.isSafeInteger(build.builtAt) && build.builtAt > 0
}

async function getPublishedBuild() {
  const url = new URL('release.json', base)
  url.searchParams.set('check', String(Date.now()))
  const abort = new AbortController()
  const timeout = window.setTimeout(() => abort.abort(), 8000)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: abort.signal })
    if (response.ok) {
      const build: unknown = await response.json()
      if (validBuild(build) && build.builtAt >= current.builtAt) return build
    }
  } catch { /* Offline startup can keep using its installed release. */ }
  finally { window.clearTimeout(timeout) }
}

function workerBuildTime(worker?: ServiceWorker | null) {
  return worker ? Number(new URL(worker.scriptURL).searchParams.get('builtAt')) || 0 : 0
}

export function buildIdOf(worker?: ServiceWorker | null) {
  return worker ? new URL(worker.scriptURL).searchParams.get('build') : null
}

export async function findLatestRegistration(existing?: ServiceWorkerRegistration) {
  const published = await getPublishedBuild()
  const target = published ?? current
  if (existing) {
    const workers = [existing.active, existing.waiting, existing.installing]
    const newest = Math.max(...workers.map(workerBuildTime))
    if (target.builtAt <= newest) return existing
  }

  const url = new URL('sw-' + target.id + '.js', base)
  url.searchParams.set('build', target.id)
  url.searchParams.set('builtAt', String(target.builtAt))
  return navigator.serviceWorker.register(url, { scope: base.pathname, updateViaCache: 'none' })
}

export async function pruneShellCaches(scope: string) {
  const names = (await caches.keys()).filter((name) =>
    /^(ons-[a-f0-9-]{36}|workbox)-precache-v2-/.test(name) && name.endsWith('-' + scope),
  )
  await Promise.all(names.slice(0, -3).map((name) => caches.delete(name)))
}
