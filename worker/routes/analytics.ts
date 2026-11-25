import type { AppEnv } from '../index'
import { json, readSmallJson } from '../http'
import { readStatisticsAdmin } from '../analytics/admin'

export const statisticsAdminPath = '/api/v1/admin/study-statistics'
const filterNames = ['stage', 'part', 'chapter', 'section', 'version'] as const

export async function statisticsAdminRoute(request: Request, env: AppEnv, url: URL, adminId: string) {
  if (env.ANALYTICS_ENABLED !== '1') return json({ error: 'statistics_disabled' }, 404)
  if (request.method === 'GET' && url.pathname === statisticsAdminPath) {
    const page = Number(url.searchParams.get('page') ?? 1)
    const filters = Object.fromEntries(filterNames.flatMap((name) => {
      const value = url.searchParams.get(name)
      return value ? [[name, Number(value)]] : []
    })) as Partial<Record<typeof filterNames[number], number>>
    if (!Number.isSafeInteger(page) || page < 1 || page > 200 || (filters.stage ?? 1) > 3
      || Object.values(filters).some((value) => !Number.isSafeInteger(value) || value < 1 || value > 9999)) {
      return json({ error: 'invalid_input' }, 400)
    }
    return json(await readStatisticsAdmin(env.DB, { page, ...filters, flagged: url.searchParams.get('flagged') === '1' }), 200)
  }
  if (request.method === 'POST' && url.pathname === statisticsAdminPath + '/difficulty') {
    const input = await readSmallJson(request)
    const boundaries = input && typeof input === 'object' && 'boundaries' in input ? input.boundaries : null
    if (!Array.isArray(boundaries) || boundaries.length !== 4 || boundaries.some((value, index) =>
      !Number.isInteger(value) || value < 1 || value > 100 || (index > 0 && boundaries[index - 1] <= value))) {
      return json({ error: 'invalid_input' }, 400)
    }
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare('UPDATE study_statistics_settings SET very_easy = ?, easy = ?, medium = ?, hard = ? WHERE id = 1')
        .bind(...boundaries),
      env.DB.prepare(`INSERT INTO audit_events (id, actor_user_id, action, target_id, occurred_at) VALUES (?, ?, 'study_difficulty_updated', ?, ?)`)
        .bind(crypto.randomUUID(), adminId, JSON.stringify(boundaries), now),
    ])
    return json({ ok: true }, 200)
  }
  return json({ error: 'not_found' }, 404, request.method)
}
