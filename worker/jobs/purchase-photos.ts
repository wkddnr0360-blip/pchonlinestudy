import type { AppEnv } from '../index'
import { approvedPurchasePhotoRetentionDays } from '../../shared/purchase'

const dayMs = 86_400_000

export async function purgeReviewedPhotos(env: AppEnv, scheduledTime: number) {
  const retentionDays = Number(env.PURCHASE_PHOTO_RETENTION_DAYS)
  const approvedCutoff = scheduledTime - approvedPurchasePhotoRetentionDays * dayMs
  const otherCutoff = Number.isSafeInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 90
    ? scheduledTime - retentionDays * dayMs
    : null

  await env.DB.prepare(`DELETE FROM purchase_request_photos WHERE purchase_id IN (
    SELECT req.id FROM purchase_requests req JOIN purchase_request_photos photo ON photo.purchase_id = req.id
    WHERE (status = 'approved' AND reviewed_at <= ?)
       OR (status IN ('rejected', 'resubmit') AND reviewed_at <= ?)
    ORDER BY reviewed_at, req.id LIMIT 50
  )`).bind(approvedCutoff, otherCutoff).run()
}
