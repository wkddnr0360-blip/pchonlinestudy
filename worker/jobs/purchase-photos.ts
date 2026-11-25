import type { AppEnv } from '../index'
import { approvedPurchasePhotoRetentionDays } from '../../shared/purchase'

const dayMs = 86_400_000

export async function purgeReviewedPhotos(env: AppEnv, scheduledTime: number) {
  const retentionDays = Number(env.PURCHASE_PHOTO_RETENTION_DAYS)
  const approvedCutoff = scheduledTime - approvedPurchasePhotoRetentionDays * dayMs
  const otherCutoff = Number.isSafeInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 90
    ? scheduledTime - retentionDays * dayMs
    : null

  const { results } = await env.DB.prepare(`SELECT id, photo_key AS photoKey FROM purchase_requests
    WHERE photo_key IS NOT NULL AND (
      (status = 'approved' AND reviewed_at <= ?)
      OR (status IN ('rejected', 'resubmit') AND reviewed_at <= ?)
    ) ORDER BY reviewed_at, id LIMIT 50`)
    .bind(approvedCutoff, otherCutoff).all<{ id: string; photoKey: string }>()
  if (!results.length) return

  await env.PRIVATE_FILES.delete(results.map(({ photoKey }) => photoKey))
  await env.DB.batch(results.map(({ id, photoKey }) => env.DB.prepare(
    'UPDATE purchase_requests SET photo_key = NULL WHERE id = ? AND photo_key = ?',
  ).bind(id, photoKey)))
}
