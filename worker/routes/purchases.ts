import type { AppEnv } from '../index'
import type { PurchaseFilter } from '../../shared/purchase'
import { json, readLimitedBody, readSmallJson } from '../http'
import { readMemberAccess } from '../services/book-access'
import { adminPurchaseById, cleanPurchasePhoto, createPurchase, issueTicket, latestPurchase, photoSizeLimit, purchasePhoto, purchaseQueue, reviewPurchase, revokeTicket, ticketHistory } from '../services/purchases'

export const purchasePath = '/api/v1/purchase'
export const adminPrefix = '/api/v1/admin/'
const idPattern = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
const purchaseAction = new RegExp(`^/api/v1/admin/purchases/(${idPattern})/(photo|review|ticket|tickets)$`)
const purchaseDetail = new RegExp(`^/api/v1/admin/purchases/(${idPattern})$`)
const ticketAction = new RegExp(`^/api/v1/admin/tickets/(${idPattern})/revoke$`)
const purchaseId = new RegExp(`^${idPattern}$`)
const purchaseFilters = new Set<PurchaseFilter>(['all', 'pending', 'approved', 'rejected', 'resubmit', 'redeemed'])

function fields(data: unknown): Record<string, unknown> | null {
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null
}

export async function memberPurchaseRoute(request: Request, env: AppEnv, userId: string) {
  if (request.method === 'GET') return json({ purchase: await latestPurchase(env.DB, userId) }, 200)
  if (request.method !== 'POST') return json({ error: 'not_found' }, 404, request.method)
  const [access, existing] = await Promise.all([readMemberAccess(env.DB, userId, Date.now()), latestPurchase(env.DB, userId)])
  if (access.bookVerified || existing?.status === 'pending' || existing?.status === 'approved') {
    return json({ error: 'purchase_exists' }, 409)
  }
  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.startsWith('multipart/form-data;')) return json({ error: 'invalid_media_type' }, 400)
  const bytes = await readLimitedBody(request, photoSizeLimit + 4096)
  if (!bytes) return json({ error: 'photo_too_large' }, 413)
  let form: FormData
  try {
    form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData()
  } catch {
    return json({ error: 'invalid_multipart' }, 400)
  }
  const nickname = form.get('nickname')
  const photo = form.get('photo')
  if (typeof nickname !== 'string' || !nickname.trim() || nickname.trim().length > 60 || /\p{Cc}/u.test(nickname) || !(photo instanceof File) || photo.type !== 'image/jpeg') {
    return json({ error: 'invalid_application_fields' }, 400)
  }
  const clean = cleanPurchasePhoto(new Uint8Array(await photo.arrayBuffer()))
  if (!clean) return json({ error: 'invalid_photo' }, 422)
  const purchase = await createPurchase(env.DB, env.PRIVATE_FILES, userId, nickname.trim(), clean, Date.now())
  return purchase ? json({ purchase }, 201) : json({ error: 'purchase_exists' }, 409)
}

export async function adminPurchaseRoute(request: Request, env: AppEnv, url: URL, adminId: string) {
  const { pathname, searchParams } = url
  if (request.method === 'GET' && pathname === adminPrefix + 'purchases') {
    const page = Number(searchParams.get('page') ?? '1')
    const filter = (searchParams.get('status') ?? 'all') as PurchaseFilter
    const search = (searchParams.get('q') ?? '').trim()
    if (!Number.isSafeInteger(page) || page < 1 || page > 500 || !purchaseFilters.has(filter) || search.length > 60) {
      return json({ error: 'invalid_input' }, 400)
    }
    return json(await purchaseQueue(env.DB, (page - 1) * 20, filter, search), 200)
  }
  const detail = pathname.match(purchaseDetail)
  if (request.method === 'GET' && detail) {
    const purchase = await adminPurchaseById(env.DB, detail[1])
    return purchase ? json({ purchase }, 200) : json({ error: 'not_found' }, 404)
  }

  const action = pathname.match(purchaseAction)
  if (action?.[2] === 'tickets' && request.method === 'GET') {
    return json({ tickets: await ticketHistory(env.DB, action[1]) }, 200)
  }
  if (action && request.method === 'GET' && action[2] === 'photo') {
    const photo = await purchasePhoto(env.DB, env.PRIVATE_FILES, action[1], adminId)
    return photo ? new Response(photo.body, { headers: {
      'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Cloudflare-CDN-Cache-Control': 'no-store',
    } }) : json({ error: 'not_found' }, 404)
  }
  if (request.method !== 'POST') return json({ error: 'not_found' }, 404, request.method)

  if (action?.[2] === 'review') {
    const data = fields(await readSmallJson(request))
    const decision = data?.decision
    if (decision !== 'approved' && decision !== 'rejected' && decision !== 'resubmit') return json({ error: 'invalid_input' }, 400)
    const note = typeof data?.note === 'string' ? data.note.trim() : ''
    if (note.length > 250 || (decision !== 'approved' && !note)) return json({ error: 'invalid_input' }, 400)
    const reviewed = await reviewPurchase(env.DB, action[1], adminId, decision, note, Date.now())
    return reviewed ? json({ ok: true }, 200) : json({ error: 'stale_review' }, 409)
  }
  if (action?.[2] === 'ticket') {
    const data = fields(await readSmallJson(request))
    const expected = data?.expectedTicketId
    if (expected !== null && (typeof expected !== 'string' || !purchaseId.test(expected))) return json({ error: 'invalid_input' }, 400)
    const hours = Number(env.PURCHASE_TICKET_TTL_HOURS)
    if (!Number.isSafeInteger(hours) || hours < 1 || hours > 336) return json({ error: 'ticket_lifetime_unconfigured' }, 503)
    const ticket = await issueTicket(env.DB, action[1], adminId, expected, hours * 60 * 60 * 1000, Date.now())
    return ticket ? json(ticket, 201) : json({ error: 'stale_review' }, 409)
  }

  const revoke = pathname.match(ticketAction)
  if (revoke) {
    const result = await revokeTicket(env.DB, revoke[1], adminId, Date.now())
    return result ? json({ ok: true }, 200) : json({ error: 'stale_review' }, 409)
  }
  return json({ error: 'not_found' }, 404)
}
