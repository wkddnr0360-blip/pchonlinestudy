import * as Dialog from '@radix-ui/react-dialog'
import { BadgeCheck, CalendarDays, ClipboardCheck, Copy, FileImage, History, ShieldAlert, Ticket, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { purchaseStatusLabel, type AdminPurchase, type PurchaseStatus, type PurchaseTicket } from '../../../shared/purchase'
import { TicketArt } from '../auth/TicketArt'
import { adminDate, RequestStatus, TicketStatus } from './PurchaseQueue'

type Decision = Exclude<PurchaseStatus, 'pending'>
type Mutation = { kind: 'review'; decision: Decision; note: string } | { kind: 'issue' } | { kind: 'revoke'; ticket: PurchaseTicket }

interface ReviewProps {
  row: AdminPurchase
  opener: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onChanged: (id: string) => Promise<void>
  onReauthenticate: () => Promise<void>
}

export function PurchaseReview({ row, opener, onClose, onChanged, onReauthenticate }: ReviewProps) {
  const [showPhoto, setShowPhoto] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [issuedCode, setIssuedCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [tickets, setTickets] = useState<PurchaseTicket[] | null>(null)
  const [confirm, setConfirm] = useState<Mutation>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirmation = useRef<HTMLElement>(null)
  useEffect(() => { if (confirm) confirmation.current?.focus() }, [confirm])

  async function request(suffix: string, body?: object) {
    const response = await fetch('/api/v1/admin/' + suffix, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
    } : { cache: 'no-store' })
    if (response.status === 403) {
      await onReauthenticate()
      throw new Error('관리자 인증을 다시 진행해 주세요.')
    }
    if (response.status === 409) {
      await onChanged(row.id)
      throw new Error('신청 상태가 변경되었습니다. 새 상태를 확인해 주세요.')
    }
    if (!response.ok) throw new Error('요청을 완료하지 못했습니다. 입력 정보와 상태를 확인해 주세요.')
    return response.json()
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : '처리를 완료하지 못했습니다.') }
    finally { setBusy(false) }
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const decision = data.get('decision') as Decision
    const note = String(data.get('note') ?? '').trim()
    if (decision !== 'approved' && !note) {
      setError('반려·재제출 사유를 입력해 주세요.')
      return
    }
    setError('')
    setConfirm({ kind: 'review', decision, note })
  }

  function apply() {
    if (!confirm) return
    void run(async () => {
      const path = `purchases/${row.id}`
      if (confirm.kind === 'review') await request(`${path}/review`, { decision: confirm.decision, note: confirm.note })
      if (confirm.kind === 'issue') {
        const { code } = await request(`${path}/ticket`, { expectedTicketId: row.ticket?.id ?? null })
        setIssuedCode(code)
        setCopied(false)
      }
      if (confirm.kind === 'revoke') await request(`tickets/${confirm.ticket.id}/revoke`, {})
      setConfirm(undefined)
      setTickets(null)
      await onChanged(row.id)
    })
  }

  const prompt = confirm?.kind === 'review' ? `${purchaseStatusLabel[confirm.decision]} 결과를 저장할까요?`
    : confirm?.kind === 'issue' ? row.ticket ? '새 티켓을 발급하면 이전 미사용 티켓이 폐기됩니다.' : '이 신청자에게 1회용 티켓을 발급할까요?'
      : '이 티켓을 폐기할까요?'

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <div className="ons-admin-overlay" aria-hidden="true" />
      <Dialog.Content className="ons-admin-drawer" onCloseAutoFocus={(event) => {
        event.preventDefault()
        opener.current?.focus()
      }}>
        <header className="ons-admin-drawer-header">
          <span className="ons-admin-metric-icon ons-tone-violet"><ClipboardCheck size={22} aria-hidden="true" /></span>
          <div><Dialog.Title>{row.cafeNickname}</Dialog.Title><Dialog.Description>교재 구매 인증 신청 상세</Dialog.Description></div>
          <Dialog.Close asChild><button className="ons-admin-icon-button" aria-label="상세 닫기"><X size={20} aria-hidden="true" /></button></Dialog.Close>
        </header>
        <div className="ons-admin-drawer-body">
          {error && <p className="ons-error" role="alert">{error}</p>}
          <div className="ons-admin-detail-meta"><RequestStatus status={row.status} /><span><CalendarDays size={15} aria-hidden="true" />{adminDate.format(row.submittedAt)}</span></div>
          {row.reviewNote && <p className="ons-admin-note">{row.reviewNote}</p>}
          <section className="ons-admin-detail-section">
            <h3><FileImage size={18} aria-hidden="true" />제출 사진</h3>
            {row.hasPhoto ? <>
              <button type="button" className="ons-admin-action" onClick={() => { setShowPhoto(!showPhoto); setPhotoFailed(false) }}>
                <FileImage size={16} aria-hidden="true" />{showPhoto ? '사진 접기' : '제출 사진 열기'}
              </button>
              {showPhoto && !photoFailed && <img className="ons-admin-photo" src={`/api/v1/admin/purchases/${row.id}/photo`}
                alt={`${row.cafeNickname}님이 제출한 교재 사진`} onError={() => setPhotoFailed(true)} />}
              {showPhoto && photoFailed && <p role="status">사진을 불러오지 못했습니다.</p>}
            </> : <p>저장된 제출 사진이 없습니다.</p>}
          </section>
          {row.status === 'pending' && <section className="ons-admin-detail-section">
            <h3><BadgeCheck size={18} aria-hidden="true" />검토 결과</h3>
            <form className="ons-admin-form" onSubmit={review}>
              <label>처리 상태<select name="decision"><option value="approved">승인</option><option value="resubmit">재제출 요청</option><option value="rejected">반려</option></select></label>
              <label>검토 메모<textarea name="note" maxLength={250} rows={3} placeholder="반려·재제출 사유를 입력해 주세요" /></label>
              <button type="submit" className="ons-button" disabled={busy}><BadgeCheck size={17} aria-hidden="true" />검토 결과 저장</button>
            </form>
          </section>}
          {row.status === 'approved' && <section className="ons-admin-detail-section">
            <h3><Ticket size={19} aria-hidden="true" />1회용 티켓</h3>
            {row.ticket && <div className="ons-admin-detail-meta"><TicketStatus ticket={row.ticket} /><span>{adminDate.format(row.ticket.issuedAt)} 발급</span></div>}
            {issuedCode && <div className="ons-admin-issued" role="status">
              <TicketArt />
              <div><strong>발급한 티켓</strong><p>이 화면에서만 코드를 확인할 수 있습니다.</p>
                <code>{issuedCode}</code>
                <div className="ons-admin-actions">
                  <button type="button" className="ons-admin-action" onClick={() => void run(async () => {
                    await navigator.clipboard.writeText(issuedCode)
                    setCopied(true)
                  })}><Copy size={16} aria-hidden="true" />{copied ? '복사됨' : '코드 복사'}</button>
                  <button type="button" className="ons-admin-action" onClick={() => setIssuedCode('')}>티켓 코드 닫기</button>
                </div>
              </div>
            </div>}
            <div className="ons-admin-actions">
              {!row.ticket?.redeemedAt && <button type="button" className="ons-button" disabled={busy} onClick={() => setConfirm({ kind: 'issue' })}>
                <Ticket size={17} aria-hidden="true" />{row.ticket ? '티켓 재발급' : '1회용 티켓 발급'}
              </button>}
              {row.ticket && !row.ticket.redeemedAt && !row.ticket.revokedAt && <button type="button" className="ons-admin-action ons-admin-danger" disabled={busy}
                onClick={() => setConfirm({ kind: 'revoke', ticket: row.ticket! })}><Trash2 size={16} aria-hidden="true" />티켓 폐기</button>}
              {row.ticket && <button type="button" className="ons-admin-action" disabled={busy} onClick={() => {
                if (tickets) setTickets(null)
                else void run(async () => setTickets((await request(`purchases/${row.id}/tickets`)).tickets))
              }}><History size={16} aria-hidden="true" />{tickets ? '발급 이력 닫기' : '최근 발급 이력'}</button>}
            </div>
            {tickets && <ul className="ons-admin-history">{tickets.map((ticket) => <li key={ticket.id}>
              <time dateTime={new Date(ticket.issuedAt).toISOString()}>{adminDate.format(ticket.issuedAt)}</time><TicketStatus ticket={ticket} />
            </li>)}</ul>}
          </section>}
          {confirm && <section className="ons-admin-confirm" aria-label="처리 확인" tabIndex={-1} ref={confirmation}>
            <ShieldAlert size={21} aria-hidden="true" />
            <div><strong>{prompt}</strong><div className="ons-admin-actions">
              <button type="button" className="ons-button" disabled={busy} onClick={apply}>확인</button>
              <button type="button" className="ons-admin-action" disabled={busy} onClick={() => setConfirm(undefined)}>취소</button>
            </div></div>
          </section>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
