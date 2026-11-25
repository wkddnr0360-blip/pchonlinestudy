import {
  BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, Clock3, Filter,
  Image, Inbox, RefreshCw, Search, Ticket, TicketCheck, XCircle,
} from 'lucide-react'
import type { FormEvent, MouseEvent } from 'react'
import { purchaseStatusLabel, type AdminPurchase, type PurchaseFilter, type PurchaseQueue, type PurchaseTicket } from '../../../shared/purchase'

export const adminDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })
const numbers = new Intl.NumberFormat('ko-KR')
const statusIcons = { pending: Clock3, approved: BadgeCheck, rejected: XCircle, resubmit: CircleAlert }
const filters = { all: '전체 상태', ...purchaseStatusLabel, redeemed: '티켓 사용 완료' }
const metrics = [
  { key: 'total', filter: 'all', title: '전체 신청', icon: ClipboardList, tone: 'violet' },
  { key: 'pending', filter: 'pending', title: '검토 대기', icon: Clock3, tone: 'amber' },
  { key: 'approved', filter: 'approved', title: '승인 완료', icon: BadgeCheck, tone: 'mint' },
  { key: 'redeemed', filter: 'redeemed', title: '티켓 사용', icon: TicketCheck, tone: 'blue' },
] as const

export function ticketStatus(ticket: PurchaseTicket) {
  if (ticket.redeemedAt !== null) return { label: '사용 완료', tone: 'mint', icon: TicketCheck }
  if (ticket.revokedAt !== null) return { label: '폐기됨', tone: 'neutral', icon: XCircle }
  if (ticket.expiresAt <= Date.now()) return { label: '만료됨', tone: 'neutral', icon: Clock3 }
  return { label: '발급됨', tone: 'violet', icon: Ticket }
}

export function RequestStatus({ status }: { status: AdminPurchase['status'] }) {
  const Icon = statusIcons[status]
  return <span className={`ons-admin-badge ons-request-${status}`}><Icon size={13} aria-hidden="true" />{purchaseStatusLabel[status]}</span>
}

export function TicketStatus({ ticket }: { ticket: PurchaseTicket }) {
  const { icon: Icon, label, tone } = ticketStatus(ticket)
  return <span className={`ons-admin-badge ons-tone-${tone}`}><Icon size={13} aria-hidden="true" />{label}</span>
}

interface QueueProps {
  queue: PurchaseQueue | null
  busy: boolean
  page: number
  filter: PurchaseFilter
  query: string
  onFilter: (filter: PurchaseFilter) => void
  onSearch: (query: string) => void
  onPage: (page: number) => void
  onRefresh: () => void
  onOpen: (row: AdminPurchase, event: MouseEvent<HTMLButtonElement>) => void
}

export function PurchaseQueueView({ queue, busy, page, filter, query, onFilter, onSearch, onPage, onRefresh, onOpen }: QueueProps) {
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(String(new FormData(event.currentTarget).get('query') ?? '').trim())
  }

  return <>
    <section className="ons-admin-metrics" aria-label="구매 인증 현황">
      {metrics.map(({ key, filter: target, title, icon: Icon, tone }) => <button type="button" key={key} className="ons-admin-metric"
        onClick={() => onFilter(target)} aria-pressed={filter === target}>
        <span className={`ons-admin-metric-icon ons-tone-${tone}`}><Icon size={21} aria-hidden="true" /></span>
        <span><span className="ons-admin-metric-label">{title}</span><strong>{queue ? numbers.format(queue.summary[key]) : '–'}</strong></span>
        <ChevronRight size={16} className="ons-admin-metric-arrow" aria-hidden="true" />
      </button>)}
    </section>
    <section className="ons-admin-list" aria-labelledby="ons-admin-list-title" aria-busy={busy}>
      <header className="ons-admin-list-bar">
        <div>
          <h2 id="ons-admin-list-title">구매 인증 신청</h2>
          {queue && <p>총 {numbers.format(queue.total)}건</p>}
        </div>
        <div className="ons-admin-tools">
          <form key={query} className="ons-admin-search" onSubmit={submitSearch} role="search">
            <input name="query" type="search" maxLength={60} defaultValue={query} placeholder="카페 닉네임 검색" aria-label="카페 닉네임 검색" />
            <button type="submit" aria-label="검색" title="검색"><Search size={20} aria-hidden="true" /></button>
          </form>
          <label className="ons-admin-filter">
            <Filter size={16} aria-hidden="true" />
            <select aria-label="신청 상태 필터" value={filter} onChange={(event) => onFilter(event.target.value as PurchaseFilter)}>
              {Object.entries(filters).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="ons-admin-icon-button" aria-label="목록 새로고침" title="목록 새로고침" disabled={busy} onClick={onRefresh}>
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      {!queue && <div className="ons-admin-empty" role="status">신청 목록을 불러오고 있습니다.</div>}
      {queue && queue.purchases.length === 0 && <div className="ons-admin-empty" role="status">
        <Inbox size={24} aria-hidden="true" /><strong>표시할 신청이 없습니다</strong>
        {(filter !== 'all' || query) && <button className="ons-admin-action" type="button" onClick={() => { onFilter('all'); onSearch('') }}>검색 조건 지우기</button>}
      </div>}
      {queue && queue.purchases.length > 0 && <div className="ons-admin-table-wrap">
        <table className="ons-admin-table" aria-label="교재 구매 인증 신청 목록">
          <thead><tr><th scope="col">신청자</th><th scope="col" className="ons-admin-optional">접수 일시</th><th scope="col">검토 상태</th>
            <th scope="col" className="ons-admin-optional">티켓 상태</th><th scope="col"><span className="ons-admin-hidden">상세</span></th></tr></thead>
          <tbody>{queue.purchases.map((row) => <tr key={row.id}>
            <th scope="row"><div className="ons-admin-person">
              <span className="ons-admin-avatar" aria-hidden="true">{Array.from(row.cafeNickname)[0]}</span>
              <div><strong>{row.cafeNickname}</strong><span>{row.hasPhoto ? <Image size={13} aria-hidden="true" /> : <CalendarDays size={13} aria-hidden="true" />}{row.hasPhoto ? '사진 제출' : '신청 기록'}</span></div>
            </div></th>
            <td className="ons-admin-optional">{adminDate.format(row.submittedAt)}</td>
            <td><RequestStatus status={row.status} /></td>
            <td className="ons-admin-optional">{row.ticket ? <TicketStatus ticket={row.ticket} /> : <span className="ons-admin-muted">발급 전</span>}</td>
            <td><button type="button" className="ons-admin-icon-button ons-admin-open" aria-label={`${row.cafeNickname} 검토 상세`} onClick={(event) => onOpen(row, event)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {queue && queue.total > 0 && <nav className="ons-admin-pagination" aria-label="구매 인증 목록 페이지">
        <span>{(page - 1) * 20 + 1}–{Math.min(page * 20, queue.total)} / {numbers.format(queue.total)}</span>
        <div><button type="button" className="ons-admin-icon-button" disabled={page <= 1 || busy} aria-label="이전 페이지" onClick={() => onPage(page - 1)}><ChevronLeft size={17} aria-hidden="true" /></button>
          <button type="button" className="ons-admin-icon-button" disabled={!queue.hasNext || busy} aria-label="다음 페이지" onClick={() => onPage(page + 1)}><ChevronRight size={17} aria-hidden="true" /></button></div>
      </nav>}
    </section>
  </>
}
