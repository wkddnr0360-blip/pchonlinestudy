import { decode, encode } from 'jpeg-js'
import type { AdminPurchase, PurchaseRequest, PurchaseStatus, PurchaseTicket } from '../../shared/purchase'
import { bookCampaign, createTicketCode, ticketHash } from './book-access'

const photoPrefix = 'verification/'
export const photoSizeLimit = 3 * 1024 * 1024

export function cleanPurchasePhoto(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes.length > photoSizeLimit || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  try {
    const { width, height, data } = decode(bytes, {
      useTArray: true, tolerantDecoding: false, maxResolutionInMP: 1.7, maxMemoryUsageInMB: 20,
    })
    if (width < 160 || height < 160 || width > 1280 || height > 1280) return null
    const jpeg = encode({ width, height, data }, 85).data
    return jpeg.length <= photoSizeLimit ? jpeg : null
  } catch {
    return null
  }
}

const requestColumns = `req.id, req.cafe_nickname AS cafeNickname, req.status, req.submitted_at AS submittedAt,
  req.reviewed_at AS reviewedAt, req.review_note AS reviewNote`

export function latestPurchase(db: D1Database, userId: string) {
  return db.prepare(`SELECT ${requestColumns} FROM purchase_requests AS req
    WHERE req.user_id = ? AND req.campaign_id = ? ORDER BY req.submitted_at DESC, req.id DESC LIMIT 1`)
    .bind(userId, bookCampaign).first<PurchaseRequest>()
}

export async function createPurchase(db: D1Database, files: R2Bucket, userId: string, nickname: string, photo: Uint8Array, now: number) {
  const id = crypto.randomUUID()
  const key = photoPrefix + id + '.jpg'
  await files.put(key, photo, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } })

  const result = await db.prepare(`
    INSERT INTO purchase_requests (id, user_id, campaign_id, cafe_nickname, photo_key, status, submitted_at)
    SELECT ?, ?, ?, ?, ?, 'pending', ?
    WHERE EXISTS (SELECT 1 FROM book_campaigns WHERE id = ? AND ends_at > ?)
      AND NOT EXISTS (SELECT 1 FROM member_controls WHERE user_id = ? AND suspended_at IS NOT NULL)
    ON CONFLICT DO NOTHING
  `).bind(id, userId, bookCampaign, nickname, key, now, bookCampaign, now, userId).run().catch(async (error: unknown) => {
    // A transport failure may follow a committed insert. Keep any photo already linked to its request.
    const recorded = await db.prepare('SELECT id FROM purchase_requests WHERE id = ?').bind(id).first().catch(() => undefined)
    if (recorded === null) await files.delete(key).catch(() => undefined)
    throw error
  })
  if (!result.meta.changes) {
    await files.delete(key)
    return null
  }
  return { id, cafeNickname: nickname, status: 'pending', submittedAt: now, reviewedAt: null, reviewNote: null } satisfies PurchaseRequest
}

type PurchaseRow = PurchaseRequest & {
  photoKey: string | null
  codeId: string | null
  issuedAt: number | null
  expiresAt: number | null
  redeemedAt: number | null
  revokedAt: number | null
}

export async function purchaseQueue(db: D1Database, offset: number): Promise<AdminPurchase[]> {
  const { results } = await db.prepare(`
    SELECT ${requestColumns}, req.photo_key AS photoKey, code.id AS codeId,
      code.issued_at AS issuedAt, code.expires_at AS expiresAt, code.redeemed_at AS redeemedAt, code.revoked_at AS revokedAt
    FROM purchase_requests req LEFT JOIN access_codes code ON code.id = req.last_code_id
    ORDER BY CASE req.status WHEN 'pending' THEN 0 ELSE 1 END, req.submitted_at DESC, req.id DESC LIMIT 21 OFFSET ?
  `).bind(offset).all<PurchaseRow>()
  return results.map(({ photoKey, codeId, issuedAt, expiresAt, redeemedAt, revokedAt, ...request }) => ({
    ...request, hasPhoto: photoKey !== null,
    ticket: codeId && issuedAt !== null && expiresAt !== null ? { id: codeId, issuedAt, expiresAt, redeemedAt, revokedAt } : null,
  }))
}

export async function ticketHistory(db: D1Database, requestId: string) {
  const { results } = await db.prepare(`SELECT id, issued_at AS issuedAt, expires_at AS expiresAt,
    redeemed_at AS redeemedAt, revoked_at AS revokedAt FROM access_codes
    WHERE request_id = ? ORDER BY issued_at DESC, id DESC LIMIT 30`).bind(requestId).all<PurchaseTicket>()
  return results
}

export async function purchasePhoto(db: D1Database, files: R2Bucket, requestId: string, adminId: string) {
  const row = await db.prepare('SELECT photo_key AS photoKey FROM purchase_requests WHERE id = ?')
    .bind(requestId).first<{ photoKey: string | null }>()
  if (!row?.photoKey) return null
  const object = await files.get(row.photoKey)
  if (!object) return null
  await db.prepare('INSERT INTO audit_events (id, actor_user_id, action, target_id, occurred_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), adminId, 'purchase_photo_viewed', requestId, Date.now()).run()
  return object
}

export async function reviewPurchase(db: D1Database, requestId: string, adminId: string, next: Exclude<PurchaseStatus, 'pending'>, note: string, now: number) {
  const result = await db.prepare(`
    UPDATE purchase_requests SET status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?
    WHERE id = ? AND status = 'pending' AND photo_key IS NOT NULL
      AND EXISTS (SELECT 1 FROM member_roles WHERE user_id = ? AND role = 'admin')
  `).bind(next, note || null, now, adminId, requestId, adminId).run()
  return Boolean(result.meta.changes)
}

export async function issueTicket(db: D1Database, requestId: string, adminId: string, expectedTicketId: string | null, lifetime: number, now: number) {
  const campaign = await db.prepare(`SELECT campaign.ends_at AS endsAt FROM purchase_requests req
    JOIN book_campaigns campaign ON campaign.id = req.campaign_id WHERE req.id = ?`).bind(requestId).first<{ endsAt: number }>()
  if (!campaign || campaign.endsAt <= now) return null
  const code = createTicketCode()
  const id = crypto.randomUUID()
  const expiresAt = Math.min(now + lifetime, campaign.endsAt)
  const hash = await ticketHash(code)
  const updatedRequest = `EXISTS (SELECT 1 FROM purchase_requests WHERE id = ? AND last_code_id = ?)`
  const [updated] = await db.batch([
    db.prepare(`
      UPDATE purchase_requests AS req SET last_code_id = ?
      WHERE req.id = ? AND req.status = 'approved' AND req.last_code_id IS ?
        AND EXISTS (SELECT 1 FROM book_campaigns WHERE id = req.campaign_id AND ends_at > ?)
        AND EXISTS (SELECT 1 FROM member_roles WHERE user_id = ? AND role = 'admin')
        AND NOT EXISTS (SELECT 1 FROM member_controls WHERE user_id = req.user_id AND suspended_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id = req.user_id AND campaign_id = req.campaign_id AND revoked_at IS NULL)
    `).bind(id, requestId, expectedTicketId, now, adminId),
    db.prepare(`UPDATE access_codes SET revoked_at = ?, revoked_by = ? WHERE request_id = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND ${updatedRequest}`)
      .bind(now, adminId, requestId, requestId, id),
    db.prepare(`
      INSERT INTO access_codes (id, request_id, user_id, campaign_id, code_hash, issued_at, expires_at)
      SELECT ?, id, user_id, campaign_id, ?, ?, ? FROM purchase_requests WHERE id = ? AND last_code_id = ?
    `).bind(id, hash, now, expiresAt, requestId, id),
    db.prepare(`
      INSERT INTO audit_events (id, actor_user_id, action, target_id, occurred_at)
      SELECT ?, ?, 'purchase_ticket_issued', ?, ? WHERE ${updatedRequest}
    `).bind('issued:' + id, adminId, id, now, requestId, id),
  ])
  if (!updated.meta.changes) return null
  const ticket: PurchaseTicket = { id, expiresAt, issuedAt: now, redeemedAt: null, revokedAt: null }
  return { code: code.match(/.{8}/g)!.join('-'), ticket }
}

export async function revokeTicket(db: D1Database, ticketId: string, adminId: string, now: number) {
  const updated = await db.prepare(`UPDATE access_codes SET revoked_at = ?, revoked_by = ? WHERE id = ? AND redeemed_at IS NULL AND revoked_at IS NULL
      AND EXISTS (SELECT 1 FROM member_roles WHERE user_id = ? AND role = 'admin')`)
      .bind(now, adminId, ticketId, adminId).run()
  return Boolean(updated.meta.changes)
}
