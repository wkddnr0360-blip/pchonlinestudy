export type PurchaseStatus = 'pending' | 'approved' | 'rejected' | 'resubmit'

export interface PurchaseRequest {
  id: string
  cafeNickname: string
  status: PurchaseStatus
  submittedAt: number
  reviewedAt: number | null
  reviewNote: string | null
}

export interface PurchaseTicket {
  id: string
  issuedAt: number
  expiresAt: number
  redeemedAt: number | null
  revokedAt: number | null
}

export interface AdminPurchase extends PurchaseRequest {
  hasPhoto: boolean
  ticket: PurchaseTicket | null
}

export type PurchaseFilter = PurchaseStatus | 'all' | 'redeemed'

export interface PurchaseQueue {
  purchases: AdminPurchase[]
  hasNext: boolean
  total: number
  summary: { total: number; pending: number; approved: number; redeemed: number }
}

export const purchaseStatusLabel: Record<PurchaseStatus, string> = {
  pending: '검토 대기', approved: '승인', rejected: '반려', resubmit: '재제출 요청',
}
