import type { AdminPurchase, PurchaseFilter, PurchaseQueue, PurchaseRequest, PurchaseStatus, PurchaseTicket } from '../../shared/purchase'
import { bookCampaign, createTicketCode, ticketHash } from './book-access'

const hasPhoto = 'EXISTS (SELECT 1 FROM purchase_request_photos WHERE purchase_id = req.id)'

const requestColumns = `req.id, req.cafe_nickname AS cafeNickname, req.status, req.submitted_at AS submittedAt,
  req.reviewed_at AS reviewedAt, req.review_note AS reviewNote`

export function latestPurchase(db: D1Database, userId: string) {
  return db.prepare(`SELECT ${requestColumns} FROM purchase_requests AS req
    WHERE req.user_id = ? AND req.campaign_id = ? ORDER BY req.submitted_at DESC, req.id DESC LIMIT 1`)
    .bind(userId, bookCampaign).first<PurchaseRequest>()
}

export async function createPurchase(db: D1Database, userId: string, nickname: string, photo: Uint8Array, now: number) {
  const id = crypto.randomUUID()
  const [result] = await db.batch([
    db.prepare(`
      INSERT INTO purchase_requests (id, user_id, campaign_id, cafe_nickname, status, submitted_at)
      SELECT ?, ?, ?, ?, 'pending', ?
      WHERE EXISTS (SELECT 1 FROM book_campaigns WHERE id = ? AND ends_at > ?)
        AND NOT EXISTS (SELECT 1 FROM member_controls WHERE user_id = ? AND suspended_at IS NOT NULL)
      ON CONFLICT DO NOTHING
    `).bind(id, userId, bookCampaign, nickname, now, bookCampaign, now, userId),
    db.prepare(`INSERT INTO purchase_request_photos (purchase_id, jpeg)
      SELECT id, ? FROM purchase_requests WHERE id = ?`).bind(photo, id),
  ])
  if (!result.meta.changes) return null
  return { id, cafeNickname: nickname, status: 'pending', submittedAt: now, reviewedAt: null, reviewNote: null } satisfies PurchaseRequest
}

type PurchaseRow = PurchaseRequest & {
  photoPresent: 0 | 1
  codeId: string | null
  issuedAt: number | null
  expiresAt: number | null
  redeemedAt: number | null
  revokedAt: number | null
}

const joins = 'FROM purchase_requests req LEFT JOIN access_codes code ON code.id = req.last_code_id'
const columns = `${requestColumns}, ${hasPhoto} AS photoPresent, code.id AS codeId,
  code.issued_at AS issuedAt, code.expires_at AS expiresAt, code.redeemed_at AS redeemedAt, code.revoked_at AS revokedAt`

function toAdminPurchase({ photoPresent, codeId, issuedAt, expiresAt, redeemedAt, revokedAt, ...request }: PurchaseRow): AdminPurchase {
  return {
    ...request, hasPhoto: Boolean(photoPresent),
    ticket: codeId && issuedAt !== null && expiresAt !== null ? { id: codeId, issuedAt, expiresAt, redeemedAt, revokedAt } : null,
  }
}

export async function adminPurchaseById(db: D1Database, requestId: string) {
  const row = await db.prepare(`SELECT ${columns} ${joins} WHERE req.id = ? AND req.campaign_id = ?`)
    .bind(requestId, bookCampaign).first<PurchaseRow>()
  return row ? toAdminPurchase(row) : null
}

export async function purchaseQueue(db: D1Database, offset: number, filter: PurchaseFilter, search: string): Promise<PurchaseQueue> {
  const where = `WHERE req.campaign_id = ? AND (? = '' OR instr(lower(req.cafe_nickname), lower(?)) > 0)
    AND (? = 'all' OR req.status = ? OR (? = 'redeemed' AND code.redeemed_at IS NOT NULL))`
  const args = [bookCampaign, search, search, filter, filter, filter]
  const [rows, totals, counts] = await db.batch([
    db.prepare(`SELECT ${columns} ${joins} ${where}
      ORDER BY CASE req.status WHEN 'pending' THEN 0 ELSE 1 END, req.submitted_at DESC, req.id DESC LIMIT 20 OFFSET ?`)
      .bind(...args, offset),
    db.prepare(`SELECT COUNT(*) AS total ${joins} ${where}`).bind(...args),
    db.prepare(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE req.status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE req.status = 'approved') AS approved,
      COUNT(code.redeemed_at) AS redeemed ${joins} WHERE req.campaign_id = ?`).bind(bookCampaign),
  ])
  const { total } = totals.results[0] as { total: number }
  return {
    purchases: (rows.results as PurchaseRow[]).map(toAdminPurchase),
    total, hasNext: offset + 20 < total,
    summary: counts.results[0] as PurchaseQueue['summary'],
  }
}

export async function ticketHistory(db: D1Database, requestId: string) {
  const { results } = await db.prepare(`SELECT id, issued_at AS issuedAt, expires_at AS expiresAt,
    redeemed_at AS redeemedAt, revoked_at AS revokedAt FROM access_codes
    WHERE request_id = ? ORDER BY issued_at DESC, id DESC LIMIT 30`).bind(requestId).all<PurchaseTicket>()
  return results
}

export async function purchasePhoto(db: D1Database, requestId: string, adminId: string) {
  const jpeg = await db.prepare(`SELECT photo.jpeg FROM purchase_request_photos photo
    JOIN purchase_requests req ON req.id = photo.purchase_id WHERE req.id = ? AND req.campaign_id = ?`)
    .bind(requestId, bookCampaign).first<number[]>('jpeg')
  if (!jpeg) return null
  await db.prepare('INSERT INTO audit_events (id, actor_user_id, action, target_id, occurred_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), adminId, 'purchase_photo_viewed', requestId, Date.now()).run()
  return Uint8Array.from(jpeg)
}

export async function reviewPurchase(db: D1Database, requestId: string, adminId: string, next: Exclude<PurchaseStatus, 'pending'>, note: string, now: number) {
  const result = await db.prepare(`
    UPDATE purchase_requests AS req SET status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?
    WHERE id = ? AND status = 'pending' AND ${hasPhoto}
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
