export const bookCampaign = 'ons-season-5'

export interface MemberAccess {
  bookVerified: boolean
  expiresAt: number | null
}

export function createTicketCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export async function ticketHash(code: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function readMemberAccess(db: D1Database, userId: string, now: number): Promise<MemberAccess> {
  const entitlement = await db.prepare(`
    SELECT campaign.ends_at AS expiresAt
    FROM entitlements AS grant_row JOIN book_campaigns AS campaign ON campaign.id = grant_row.campaign_id
    WHERE grant_row.user_id = ? AND grant_row.campaign_id = ?
      AND grant_row.revoked_at IS NULL AND grant_row.granted_at <= ? AND campaign.ends_at > ?
  `).bind(userId, bookCampaign, now, now).first<{ expiresAt: number }>()
  return entitlement ? { bookVerified: true, expiresAt: entitlement.expiresAt } : { bookVerified: false, expiresAt: null }
}

export async function redeemAccessCode(db: D1Database, userId: string, code: string, now: number) {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-F0-9]{32}$/.test(normalized)) return null
  const digest = await ticketHash(normalized)

  const update = await db.prepare(`
    UPDATE access_codes AS code SET redeemed_at = ?
    WHERE code_hash = ? AND user_id = ? AND campaign_id = ?
      AND revoked_at IS NULL AND redeemed_at IS NULL AND issued_at <= ? AND expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM member_controls WHERE user_id = code.user_id AND suspended_at IS NOT NULL)
      AND EXISTS (SELECT 1 FROM purchase_requests WHERE id = code.request_id AND status = 'approved')
      AND EXISTS (SELECT 1 FROM book_campaigns WHERE id = code.campaign_id AND ends_at > ?)
      AND NOT EXISTS (SELECT 1 FROM entitlements
        WHERE user_id = code.user_id AND campaign_id = code.campaign_id AND revoked_at IS NULL)
    RETURNING id
  `).bind(now, digest, userId, bookCampaign, now, now, now).first<{ id: string }>()

  const redeemed = await db.prepare(`
    SELECT campaign.ends_at AS expiresAt
    FROM access_codes AS code
    JOIN entitlements AS grant_row ON grant_row.code_id = code.id
    JOIN book_campaigns AS campaign ON campaign.id = code.campaign_id
    WHERE code.code_hash = ? AND code.user_id = ? AND code.campaign_id = ? AND code.redeemed_at IS NOT NULL
      AND grant_row.revoked_at IS NULL AND campaign.ends_at > ?
      AND NOT EXISTS (SELECT 1 FROM member_controls WHERE user_id = code.user_id AND suspended_at IS NOT NULL)
  `).bind(digest, userId, bookCampaign, now).first<{ expiresAt: number }>()
  if (!redeemed) return null
  const access: MemberAccess = { bookVerified: true, expiresAt: redeemed.expiresAt }
  return { access, consumedNow: update !== null }
}
