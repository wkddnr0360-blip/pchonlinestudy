import { ArrowUpRight, BookOpen, ChartNoAxesColumnIncreasing, ClipboardCheck, House, KeyRound, ShieldCheck, UserRound } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import onsIcon from '../../../public/icons/ons-192.png'
import type { AdminPurchase, PurchaseFilter, PurchaseQueue } from '../../../shared/purchase'
import { PurchaseQueueView } from './PurchaseQueue'
import { PurchaseReview } from './PurchaseReview'
import './purchase-admin.css'

const StudyStatisticsAdmin = lazy(() => import('./StudyStatisticsAdmin').then((module) => ({ default: module.StudyStatisticsAdmin })))

type Session = { user?: { name: string }; admin: { mfaEnabled: boolean; mfaFresh: boolean; passwordRequired: boolean } | null }

async function api(path: string, body?: object, signal?: AbortSignal) {
  return fetch('/api/v1' + path, body ? {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  } : { cache: 'no-store', signal })
}

export function PurchaseAdminPage() {
  const [session, setSession] = useState<Session | null>()
  const [queue, setQueue] = useState<PurchaseQueue | null>(null)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<PurchaseFilter>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminPurchase | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const pendingVerification = new URLSearchParams(location.search).has('verify')
  const showStatistics = new URLSearchParams(location.search).get('view') === 'statistics'
  const ready = session?.admin?.mfaFresh === true

  async function loadSession() {
    const response = await api('/session')
    if (response.status === 401) {
      setSession(null)
      return
    }
    if (!response.ok) throw new Error('관리자 상태를 확인하지 못했습니다.')
    setSession(await response.json())
  }

  async function loadQueue(signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), status: filter, q: query })
    const response = await api(`/admin/purchases?${params}`, undefined, signal)
    if (response.status === 403) {
      await loadSession()
      throw new Error('관리자 인증을 다시 진행해 주세요.')
    }
    if (!response.ok) throw new Error('구매 인증 목록을 불러오지 못했습니다.')
    const data = await response.json() as PurchaseQueue
    if (!signal?.aborted) setQueue(data)
  }

  useEffect(() => { void loadSession().catch((failure) => setError(failure.message)) }, [])
  useEffect(() => {
    if (!ready || showStatistics) return
    const request = new AbortController()
    setBusy(true)
    setError('')
    void loadQueue(request.signal)
      .catch((failure) => { if (!request.signal.aborted) setError(failure.message) })
      .finally(() => { if (!request.signal.aborted) setBusy(false) })
    return () => request.abort()
  }, [ready, page, filter, query, showStatistics])

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : '요청을 완료하지 못했습니다.') }
    finally { setBusy(false) }
  }

  function enableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = new FormData(event.currentTarget).get('password')
    void run(async () => {
      const response = await api('/auth/two-factor/enable', password === null ? {} : { password })
      if (response.status === 409) throw new Error('다시 로그인한 뒤 인증 앱을 설정해 주세요.')
      if (!response.ok) throw new Error(session?.admin?.passwordRequired ? '계정 비밀번호를 확인해 주세요.' : '인증 앱 설정을 시작하지 못했습니다.')
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
      history.replaceState(null, '', showStatistics ? '/admin?view=statistics' : '/admin')
      await loadSession()
    })
  }

  async function refreshSelection(id: string) {
    const [response] = await Promise.all([api(`/admin/purchases/${id}`), loadQueue()])
    if (!response.ok) throw new Error('최신 신청 상태를 불러오지 못했습니다.')
    const { purchase } = await response.json()
    setSelected((current) => current?.id === id ? purchase : current)
  }

  const canVerify = setup || session?.admin?.mfaEnabled || (!session && pendingVerification)
  return <div className="ons-admin-shell">
    <aside className="ons-admin-sidebar">
      <a className="ons-admin-brand" href="/admin"><img src={onsIcon} alt="" width="38" height="38" /><span><strong>박철한 온스</strong><small>관리자 센터</small></span></a>
      <nav aria-label="관리자 메뉴">
        <a className="ons-admin-nav-item" href="/admin" aria-current={showStatistics ? undefined : 'page'}><ClipboardCheck size={19} aria-hidden="true" />구매 인증</a>
        <a className="ons-admin-nav-item" href="/admin?view=statistics" aria-current={showStatistics ? 'page' : undefined}><ChartNoAxesColumnIncreasing size={19} aria-hidden="true" />문항 분석</a>
      </nav>
      <nav aria-label="서비스 바로가기" className="ons-admin-shortcuts">
        <a className="ons-admin-nav-item" href="/account"><UserRound size={18} aria-hidden="true" />회원 화면<ArrowUpRight size={14} aria-hidden="true" /></a>
        <a className="ons-admin-nav-item" href="/"><House size={18} aria-hidden="true" />사이트 홈<ArrowUpRight size={14} aria-hidden="true" /></a>
      </nav>
    </aside>
    <div className="ons-admin-surface">
      <header className="ons-admin-topbar">
        <span><BookOpen size={17} aria-hidden="true" />교재 운영</span>
        {session?.admin && <span className="ons-admin-operator"><ShieldCheck size={17} aria-hidden="true" />{session.user?.name || '관리자'}</span>}
      </header>
      <main className="ons-purchase-admin">
        <header className="ons-admin-title">
          <span className="ons-admin-title-icon">{showStatistics ? <ChartNoAxesColumnIncreasing size={27} aria-hidden="true" /> : <ClipboardCheck size={27} aria-hidden="true" />}</span>
          <div><h1>{showStatistics ? '문항 분석' : '교재 구매 인증'}</h1><p>{showStatistics ? '기본 OX의 최초·반복 성적과 집계 상태를 확인합니다.' : '신청을 검토하고 회원의 1회용 티켓을 관리합니다.'}</p></div>
        </header>
        {error && <p className="ons-error" role="alert">{error}</p>}
        {session === undefined && !error && <p role="status">관리자 상태를 확인하고 있습니다.</p>}
        {!ready && !canVerify && session?.admin && <form className="ons-admin-form ons-admin-gate" onSubmit={enableMfa}>
          <h2><KeyRound size={20} aria-hidden="true" />인증 앱 설정</h2>
          {session.admin.passwordRequired && <label>계정 비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>}
          <button type="submit" className="ons-button" disabled={busy}>설정 키 받기</button>
        </form>}
        {!ready && canVerify && <form className="ons-admin-form ons-admin-gate" onSubmit={verifyMfa}>
          <h2><ShieldCheck size={20} aria-hidden="true" />관리자 2단계 확인</h2>
          {setup && <><p>인증 앱에 시간 기반 계정을 추가한 뒤 이 키를 입력하세요.</p><code>{setup}</code></>}
          <label>인증 앱 코드<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
          <button type="submit" className="ons-button" disabled={busy}>인증 확인</button>
        </form>}
        {session === null && !canVerify && <a href="/account" className="ons-button"><ShieldCheck size={17} aria-hidden="true" />관리자 계정으로 로그인</a>}
        {session && !session.admin && <p role="status">관리자 권한이 필요합니다.</p>}
        {ready && showStatistics && <Suspense fallback={<p role="status">문항 분석을 불러오는 중입니다.</p>}><StudyStatisticsAdmin /></Suspense>}
        {ready && !showStatistics && <PurchaseQueueView queue={queue} busy={busy} page={page} filter={filter} query={query}
          onFilter={(value) => { setPage(1); setFilter(value) }} onSearch={(value) => { setPage(1); setQuery(value) }}
          onPage={setPage} onRefresh={() => void run(loadQueue)} onOpen={(row, event) => { opener.current = event.currentTarget; setSelected(row) }} />}
      </main>
    </div>
    {ready && selected && <PurchaseReview key={selected.id} row={selected} opener={opener} onClose={() => setSelected(null)}
      onChanged={refreshSelection} onReauthenticate={loadSession} />}
  </div>
}
