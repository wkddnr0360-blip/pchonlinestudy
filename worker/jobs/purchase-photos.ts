import type { AppEnv } from '../index'

export async function purgeReviewedPhotos(env: AppEnv, scheduledTime: number) {
  const retentionDays = Number(env.PURCHASE_PHOTO_RETENTION_DAYS)
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) return

  const cutoff = scheduledTime - retentionDays * 86400 * 1000
  const { results } = await env.DB.prepare(`SELECT id, photo_key AS photoKey FROM purchase_requests
    WHERE reviewed_at <= ? AND photo_key IS NOT NULL ORDER BY reviewed_at, id LIMIT 50`)
    .bind(cutoff).all<{ id: string; photoKey: string }>()
  if (!results.length) return

  await env.PRIVATE_FILES.delete(results.map(({ photoKey }) => photoKey))
  await env.DB.batch(results.map(({ id, photoKey }) => env.DB.prepare(
    'UPDATE purchase_requests SET photo_key = NULL WHERE id = ? AND photo_key = ?',
  ).bind(id, photoKey)))
}
