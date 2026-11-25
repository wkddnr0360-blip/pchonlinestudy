import { useEffect, useState, type FormEvent } from 'react'
import { purchaseStatusLabel, type AdminPurchase, type PurchaseStatus, type PurchaseTicket } from '../../../shared/purchase'
import { TicketArt } from '../auth/TicketArt'
import './purchase-admin.css'

type AdminAccess = { mfaEnabled: boolean; mfaFresh: boolean }
type Session = { admin: AdminAccess | null }
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })

const api = async (path: string, body?: object) => fetch('/api/v1' + path, body ? {
  method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
} : { cache: 'no-store' })

function ticketStatus(ticket: PurchaseTicket) {
  if (ticket.redeemedAt !== null) return '사용 완료'
  if (ticket.revokedAt !== null) return '폐기됨'
  return ticket.expiresAt <= Date.now() ? '만료됨' : '발급됨'
}

export function PurchaseAdminPage() {
  const [session, setSession] = useState<Session | null>()
  const [rows, setRows] = useState<AdminPurchase[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [approvedCode, setApprovedCode] = useState<{ code: string; nickname: string } | null>(null)
  const [setup, setSetup] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [ticketHistory, setTicketHistory] = useState<{ requestId: string; tickets: PurchaseTicket[] } | null>(null)
  const pendingVerification = new URLSearchParams(location.search).has('verify')

  async function loadSession() {
    const response = await api('/session')
    if (response.status === 401) {
      setSession(null)
      return
    }
    if (!response.ok) throw new Error('관리자 로그인 상태를 확인하지 못했습니다.')
    setSession(await response.json())
  }

  async function loadPage(index: number) {
    const response = await api(`/admin/purchases?page=${index}`)
    if (response.status === 403) {
      await loadSession()
      throw new Error('관리자 권한과 인증 앱 확인을 다시 진행해 주세요.')
    }
    if (!response.ok) throw new Error('구매 인증 목록을 불러오지 못했습니다.')
    const data = await response.json()
    setRows(data.purchases)
    setHasNext(data.hasNext)
  }

  useEffect(() => { void loadSession().catch((failure) => setError(failure.message)) }, [])
  const ready = session?.admin?.mfaFresh === true
  useEffect(() => {
    if (ready) void loadPage(page).catch((failure) => setError(failure.message))
  }, [ready, page])

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : '관리자 요청을 완료하지 못했습니다.') }
    finally { setBusy(false) }
  }

  function enableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = new FormData(event.currentTarget).get('password')
    void run(async () => {
      const response = await api('/auth/two-factor/enable', { password })
      if (!response.ok) throw new Error('비밀번호를 확인해 주세요.')
      const data = await response.json()
      const key = new URL(data.totpURI).searchParams.get('secret')
      if (!key) throw new Error('인증 앱 설정 키를 받지 못했습니다.')
      setSetup(key)
    })
  }

  function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = new FormData(event.currentTarget).get('code')
    void run(async () => {
      const response = await api('/auth/two-factor/verify-totp', { code })
      if (!response.ok) throw new Error('인증 앱의 6자리 코드를 확인해 주세요.')
      const data = await response.json()
      if (!data.adminMfa && setup) {
        setSetup(null)
        setSession(null)
        await api('/auth/sign-out', {})
        location.assign('/account')
        return
      }
      setSetup(null)
      history.replaceState(null, '', '/admin')
      await loadSession()
    })
  }

  async function write(path: string, body: object) {
    const response = await api(path, body)
    if (response.status === 403) {
      await loadSession()
      throw new Error('관리자 권한을 다시 확인해 주세요.')
    }
    if (response.status === 409) {
      await loadPage(page)
      throw new Error('상태가 바뀌었습니다. 새로 불러온 내용을 확인해 주세요.')
    }
    if (!response.ok) throw new Error('처리 조건을 확인해 주세요.')
    setTicketHistory(null)
    return response.json()
  }

  function showTickets(row: AdminPurchase) {
    if (ticketHistory?.requestId === row.id) {
      setTicketHistory(null)
      return
    }
    void run(async () => {
      const response = await api(`/admin/purchases/${row.id}/tickets`)
      if (!response.ok) throw new Error('티켓 이력을 불러오지 못했습니다.')
      setTicketHistory({ requestId: row.id, tickets: (await response.json()).tickets })
    })
  }

  function review(event: FormEvent<HTMLFormElement>, row: AdminPurchase) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const decision = data.get('decision') as Exclude<PurchaseStatus, 'pending'>
    if (!window.confirm(`${row.cafeNickname}님의 신청을 ${purchaseStatusLabel[decision]} 처리할까요?`)) return
    void run(async () => {
      await write(`/admin/purchases/${row.id}/review`, { decision, note: data.get('note') })
      await loadPage(page)
    })
  }

  function issue(row: AdminPurchase) {
    if (!window.confirm(`${row.cafeNickname}님에게 ${row.ticket ? '새 티켓을 재발급할까요? 이전 미사용 티켓은 폐기됩니다.' : '티켓을 발급할까요?'}`)) return
    void run(async () => {
      const { code } = await write(`/admin/purchases/${row.id}/ticket`, { expectedTicketId: row.ticket?.id ?? null })
      setApprovedCode({ code, nickname: row.cafeNickname })
      await loadPage(page)
    })
  }

  const canVerify = setup || session?.admin?.mfaEnabled || (!session && pendingVerification)
  return <main className="ons-purchase-admin">
    <h1>교재 구매 인증 관리</h1>
    {error && <p className="ons-error" role="alert">{error}</p>}
    {session === undefined && !error && <p role="status">관리자 상태를 확인하고 있습니다.</p>}
    {!ready && !canVerify && session?.admin && <form className="ons-admin-box" onSubmit={enableMfa}>
      <h2>인증 앱 설정</h2>
      <label>계정 비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit" className="ons-button" disabled={busy}>설정 키 받기</button>
    </form>}
    {!ready && canVerify && <form className="ons-admin-box" onSubmit={verifyMfa}>
      <h2>관리자 2단계 확인</h2>
      {setup && <>
        <p>인증 앱에 시간 기반 계정을 추가하고 설정 키를 입력하세요.</p>
        <code>{setup}</code>
      </>}
      <label>인증 앱 코드<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
      <button type="submit" className="ons-button" disabled={busy}>인증 확인</button>
    </form>}
    {session === null && !canVerify && <p><a href="/account">관리자 계정으로 로그인</a></p>}
    {session && !session.admin && <p role="status">관리자 권한이 필요합니다.</p>}
    {ready && <>
      {approvedCode && <section className="ons-admin-box ons-ticket-used" aria-label="발급 티켓">
        <div className="ons-ticket"><TicketArt /><div><strong>{approvedCode.nickname}님 티켓</strong><span>코드는 이번 화면에서만 확인할 수 있습니다.</span></div></div>
        <code>{approvedCode.code}</code>
        <button type="button" className="ons-text-button" onClick={() => setApprovedCode(null)}>티켓 코드 닫기</button>
      </section>}
      {rows.length === 0 && <p role="status">표시할 구매 인증 신청이 없습니다.</p>}
      <div className="ons-admin-queue">
        {rows.map((row) => <article key={row.id} className="ons-admin-box" aria-label={row.cafeNickname + ' 구매 신청'}>
          <div className="ons-admin-request-header"><h2>{row.cafeNickname}</h2><strong>{purchaseStatusLabel[row.status]}</strong></div>
          <p>{dateFormat.format(row.submittedAt)}</p>
          {row.reviewNote && <p>{row.reviewNote}</p>}
          {row.hasPhoto && <button type="button" className="ons-text-button" onClick={() => setPhoto((open) => open === row.id ? null : row.id)}>
            {photo === row.id ? '사진 닫기' : '제출 사진 보기'}
          </button>}
          {photo === row.id && <img className="ons-admin-photo" src={`/api/v1/admin/purchases/${row.id}/photo`} alt={`${row.cafeNickname}님이 제출한 교재 사진`} />}
          {row.status === 'pending' && <form onSubmit={(event) => review(event, row)}>
            <label>검토 결과<select name="decision"><option value="approved">승인</option><option value="resubmit">재제출 요청</option><option value="rejected">반려</option></select></label>
            <label>검토 메모<input name="note" maxLength={250} placeholder="반려·재제출 사유를 입력하세요" /></label>
            <button type="submit" className="ons-button" disabled={busy}>검토 결과 저장</button>
          </form>}
          {row.ticket && <>
            <p>최근 티켓 · {ticketStatus(row.ticket)} · {dateFormat.format(row.ticket.issuedAt)}</p>
            <button type="button" className="ons-text-button" disabled={busy} onClick={() => showTickets(row)}>
              {ticketHistory?.requestId === row.id ? '발급 이력 닫기' : '최근 발급 이력 보기'}
            </button>
          </>}
          {ticketHistory?.requestId === row.id && <ul className="ons-admin-history">
            {ticketHistory.tickets.map((ticket) => <li key={ticket.id}>{dateFormat.format(ticket.issuedAt)} · {ticketStatus(ticket)}</li>)}
          </ul>}
          {row.status === 'approved' && !row.ticket?.redeemedAt && <div className="ons-admin-buttons">
            <button type="button" className="ons-button" disabled={busy} onClick={() => issue(row)}>{row.ticket ? '티켓 재발급' : '1회용 티켓 발급'}</button>
            {row.ticket && !row.ticket.revokedAt && <button type="button" className="ons-text-button" disabled={busy} onClick={() => {
              if (!window.confirm('이 티켓을 폐기할까요?')) return
              void run(async () => { await write(`/admin/tickets/${row.ticket!.id}/revoke`, {}); await loadPage(page) })
            }}>티켓 폐기</button>}
          </div>}
        </article>)}
      </div>
      {(page > 1 || hasNext) && <nav className="ons-admin-buttons" aria-label="구매 인증 목록 페이지">
        <button type="button" className="ons-text-button" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>이전</button>
        <button type="button" className="ons-text-button" disabled={!hasNext || busy} onClick={() => setPage(page + 1)}>다음</button>
      </nav>}
    </>}
  </main>
}
