import { ArrowLeft, ArrowRight, BadgeCheck, Eye, EyeOff, KeyRound, LockKeyhole, LogIn, Mail, MailCheck, ShieldCheck, Ticket, UserRound, UserRoundPlus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AccountArtwork } from './AccountArtwork'
import { TicketArt } from './TicketArt'
import { PurchaseForm } from './PurchaseForm'
import { AccountManagement } from './AccountManagement'
import { UsernameForm } from './UsernameForm'
import { studyReturnFromQuery } from '../study/navigation'
import googleMark from './google-g.png'
import kakaoButton from './kakao-login.png'
import './account.css'

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset'
type Methods = { email: boolean; google: boolean; kakao: boolean; username: boolean; localMail?: boolean }
type Account = {
  user: { id: string; email: string | null; name: string; username?: string }
  access: { bookVerified: boolean; expiresAt: number | null }
  admin?: { mfaEnabled: boolean; mfaFresh: boolean } | null
}

const headings: Record<Mode, string> = {
  signin: '로그인', signup: '회원가입', verify: '인증 메일 다시 보내기', forgot: '비밀번호 찾기', reset: '비밀번호 변경',
}
const instructions: Partial<Record<Mode, string>> = {
  signup: '가입한 이메일로 인증 링크를 보내 드립니다.',
  verify: '가입할 때 입력한 이메일을 사용해 주세요.',
  forgot: '가입한 이메일로 비밀번호 변경 링크를 보내 드립니다.',
}
const headingIcons = { signin: LogIn, signup: UserRoundPlus, verify: MailCheck, forgot: KeyRound, reset: LockKeyhole }

async function post(path: string, body: object) {
  return fetch(`/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

async function getAccount(signal?: AbortSignal): Promise<Account | null> {
  const response = await fetch('/api/v1/session', { cache: 'no-store', signal })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Account unavailable')
  return response.json()
}

const authActions = {
  signin: '/sign-in/email', signup: '/sign-up/email', verify: '/send-verification-email',
  forgot: '/request-password-reset', reset: '/reset-password',
} as const

const expiryDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeZone: 'Asia/Seoul' })
const socialOrigins = { google: 'https://accounts.google.com', kakao: 'https://kauth.kakao.com' } as const

export function AccountPage() {
  const [studyTarget] = useState(() => {
    const params = new URLSearchParams(location.search)
    const href = studyReturnFromQuery(params)
    return href ? { href, key: params.get('study')! } : null
  })
  const accountCallback = location.origin + '/account' + (studyTarget ? '?study=' + encodeURIComponent(studyTarget.key) : '')
  const [resetToken] = useState(() => new URLSearchParams(location.search).get('token'))
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin')
  const [usernameForm, setUsernameForm] = useState<'signin' | 'signup' | null>(null)
  const [methods, setMethods] = useState<Methods | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [notice, setNotice] = useState('')
  const [localMailLink, setLocalMailLink] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [ticketConsumed, setTicketConsumed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const authFailed = new URLSearchParams(location.search).has('error')
    if (resetToken || authFailed) history.replaceState(null, '', '/account')
    if (authFailed) setError('인증 링크 또는 로그인 상태를 확인해 주세요.')
    Promise.all([
      getAccount(controller.signal),
      fetch('/api/v1/auth-methods', { cache: 'no-store', signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error('Authentication unavailable')
        return response.json() as Promise<Methods>
      }),
    ]).then(([nextAccount, nextMethods]) => {
      setAccount(nextAccount)
      setMethods(nextMethods)
      if (!nextMethods.email) setMode('signin')
    }).catch((failure) => {
      if (failure.name !== 'AbortError') setError('계정 상태를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.')
    })
    return () => controller.abort()
  }, [resetToken])

  function changeMode(next: Mode) {
    setMode(next)
    setUsernameForm(null)
    setNotice('')
    setLocalMailLink(undefined)
    setError('')
    setPasswordVisible(false)
    requestAnimationFrame(() => heading.current?.focus())
  }

  function changeUsernameForm(next: 'signin' | 'signup') {
    changeMode('signin')
    setUsernameForm(next)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setNotice('')
    setLocalMailLink(undefined)
    setError('')
    try {
      await action()
    } catch {
      setError('요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = form.get('email')
    const password = form.get('password')
    const callbackURL = accountCallback
    const args = {
      signin: { email, password }, signup: { email, password, name: form.get('name'), callbackURL },
      verify: { email, callbackURL }, forgot: { email, redirectTo: location.origin + '/account' }, reset: { token: resetToken, newPassword: password },
    }

    void run(async () => {
      const result = await post('/auth' + authActions[mode], args[mode])
      if (result.status === 429) {
        setError('요청이 많습니다. 잠시 기다렸다 다시 시도해 주세요.')
        return
      }
      if (!result.ok) {
        setError(mode === 'signin'
          ? '이메일, 비밀번호와 이메일 인증 여부를 확인해 주세요.'
          : '입력 내용과 인증 링크의 유효 기간을 확인해 주세요.')
        return
      }
      if (mode === 'signin') {
        if ((await result.json()).twoFactorRequired) {
          location.assign('/admin?verify=1')
          return
        }
        const signedIn = await getAccount()
        if (!signedIn) throw new Error('Session missing')
        setAccount(signedIn)
      } else if (mode === 'reset') {
        setAccount(null)
        changeMode('signin')
        setNotice('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.')
      } else {
        const link = methods?.localMail ? (await result.json() as { localMailLink?: string }).localMailLink : undefined
        if (link && new URL(link).origin === location.origin) setLocalMailLink(link)
        setNotice(link ? '테스트 메일을 만들었습니다. 아래에서 인증 링크를 열 수 있어요.' : mode === 'forgot'
          ? '등록된 이메일이라면 비밀번호 재설정 링크를 보냈습니다.'
          : '인증이 필요한 이메일이라면 인증 링크를 보냈습니다.')
      }
    })
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = new FormData(event.currentTarget).get('code')
    void run(async () => {
      const result = await post('/book-access/redeem', { code })
      if (result.status === 409) {
        setError('사용 가능한 코드를 확인해 주세요.')
        return
      }
      if (!result.ok) throw new Error('Code redemption failed')
      const redeemed = await result.json() as { access: Account['access']; consumedNow: boolean }
      setAccount((current) => current ? { ...current, access: redeemed.access } : current)
      setTicketConsumed(redeemed.consumedNow)
      if (!redeemed.consumedNow) setNotice('교재 이용권을 등록했습니다.')
    })
  }

  function submitUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const signup = usernameForm === 'signup'
    void run(async () => {
      const result = await post(signup ? '/auth/sign-up/username' : '/auth/sign-in/username', {
        username: form.get('username'), password: form.get('password'), name: form.get('name'),
      })
      if (result.status === 429) return setError('요청이 많습니다. 잠시 기다렸다 다시 시도해 주세요.')
      if (result.status === 409) return setError('이미 사용 중인 아이디입니다.')
      if (!result.ok) return setError(signup ? '아이디와 비밀번호 길이를 확인해 주세요.' : '아이디와 비밀번호를 확인해 주세요.')
      if (signup) {
        changeUsernameForm('signin')
        setNotice('가입했습니다. 새 아이디로 로그인해 주세요.')
        return
      }
      const signedIn = await getAccount()
      if (!signedIn) throw new Error('Session missing')
      setAccount(signedIn)
      changeMode('signin')
    })
  }

  async function withdrawAccount(confirm: string) {
    const result = await post('/account/withdraw', { confirm })
    if (result.status === 409 || result.status === 401) return '로그아웃 후 다시 로그인하고 탈퇴를 요청해 주세요.'
    if (result.status === 403) return '관리자 계정은 관리자 역할을 해제한 뒤 탈퇴할 수 있습니다.'
    if (!result.ok) return '회원탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    setAccount(null)
    setTicketConsumed(false)
    changeMode('signin')
    setNotice('회원탈퇴를 완료했습니다.')
  }

  function socialSignIn(provider: keyof typeof socialOrigins) {
    void run(async () => {
      const result = await post('/auth/sign-in/social', {
        provider, callbackURL: accountCallback, disableRedirect: true,
      })
      if (!result.ok) throw new Error('Social sign-in unavailable')
      const target = new URL((await result.json()).url)
      if (target.origin !== socialOrigins[provider]) throw new Error('Invalid sign-in URL')
      location.assign(target.href)
    })
  }

  const showAccount = account && mode !== 'reset'
  const showGoogle = methods?.google && mode === 'signin' && !usernameForm
  const showKakao = methods?.kakao && mode === 'signin' && !usernameForm
  const showUsername = methods?.username && mode === 'signin' && !usernameForm
  const compact = !showAccount && showKakao && methods?.email
  const passwordField = mode === 'signin' || mode === 'signup' || mode === 'reset'
  const teacherStage = showAccount && account.access.bookVerified ? 3 : !showAccount && mode === 'signin' ? 1 : 2
  const HeadingIcon = showAccount ? UserRound : headingIcons[usernameForm ?? mode]
  const accountHeading = showAccount ? '내 계정' : usernameForm ? (usernameForm === 'signup' ? '아이디로 회원가입' : '아이디로 로그인') : headings[mode]
  return (
    <main className={compact ? 'ons-account ons-account-compact' : 'ons-account'}>
      <AccountArtwork stage={teacherStage} />
      <section className="ons-account-content" aria-labelledby="ons-account-heading">
        <div className="ons-account-form">
          <h1 id="ons-account-heading" tabIndex={-1} ref={heading}>
            <span className="ons-account-heading-icon"><HeadingIcon size={23} aria-hidden="true" /></span>{accountHeading}
          </h1>
          {!showAccount && instructions[mode] && <p className="ons-account-hint">{methods?.localMail
            ? <>로컬 테스트 계정은 <code>@example.test</code> 이메일을 사용해 주세요.</> : instructions[mode]}</p>}
          {notice && <div className="ons-notice" role="status">{notice}</div>}
          {localMailLink && <a className="ons-account-continue" href={localMailLink}>테스트 메일 링크 열기<ArrowRight size={17} aria-hidden="true" /></a>}
          {error && <div className="ons-error" role="alert">{error}</div>}
          {showAccount ? (
            <div className="ons-identity-panel" aria-busy={busy}>
              <section className="ons-account-section ons-identity" aria-labelledby="ons-membership-heading">
                <h2 id="ons-membership-heading"><UserRound size={18} aria-hidden="true" />이용 상태</h2>
                <strong>{account.user.name}</strong>
                {account.user.username
                  ? account.user.username !== account.user.name && <span>{account.user.username}</span>
                  : <span>{account.user.email ?? '카카오 로그인으로 가입'}</span>}
                <p className="ons-member-label">{account.access.bookVerified ? <BadgeCheck size={17} aria-hidden="true" /> : <UserRound size={17} aria-hidden="true" />}
                  {account.access.bookVerified && account.access.expiresAt !== null
                    ? `교재 인증 이용권 · ${expiryDate.format(account.access.expiresAt - 1)}까지`
                    : '무료 회원 · 교재 인증 전'}</p>
              </section>
              {ticketConsumed && <div className="ons-ticket ons-ticket-used" role="status">
                <TicketArt animate />
                <div><strong>황금 티켓 사용 완료</strong><span>정회원 이용권이 열렸어요.</span></div>
              </div>}
              {!account.access.bookVerified && <PurchaseForm />}
              {!account.access.bookVerified && (
                <form onSubmit={submitCode} className="ons-account-section ons-ticket-form" aria-label="교재 인증 티켓">
                  <div className="ons-ticket">
                    <TicketArt />
                    <div><strong>교재 인증 티켓</strong><span>내 계정에 발급된 티켓을 등록하세요.</span></div>
                  </div>
                  <label>티켓 코드<span className="ons-field-with-icon"><Ticket size={17} aria-hidden="true" /><input name="code" maxLength={80} required autoComplete="off" spellCheck={false} /></span></label>
                  <button type="submit" className="ons-button" disabled={busy}><Ticket size={17} aria-hidden="true" />티켓 사용</button>
                </form>
              )}
              {studyTarget && (account.access.bookVerified || ['1', 'review'].includes(studyTarget.key)) &&
                <a href={studyTarget.href} className="ons-account-continue">학습으로 돌아가기<ArrowRight size={17} aria-hidden="true" /></a>}
              {account.admin && <a href="/admin" className="ons-admin-link"><ShieldCheck size={17} aria-hidden="true" />관리자 페이지</a>}
              <AccountManagement busy={busy} onWithdraw={withdrawAccount} onSignOut={() => void run(async () => {
                if (!(await post('/auth/sign-out', {})).ok) throw new Error('Sign-out failed')
                setAccount(null)
                setTicketConsumed(false)
                changeMode('signin')
                setNotice('로그아웃했습니다.')
              })} />
            </div>
          ) : methods ? (
            <div className="ons-account-methods" aria-busy={busy}>
              {showGoogle && (
                <button type="button" className="ons-google-button" disabled={busy} onClick={() => socialSignIn('google')}>
                  <img src={googleMark} width="20" height="20" alt="" />Google로 로그인
                </button>
              )}
              {showKakao && (
                <button type="button" className="ons-kakao-button" disabled={busy} onClick={() => socialSignIn('kakao')}>
                  <img src={kakaoButton} width="224" height="46" alt="카카오 로그인" />
                </button>
              )}
              {usernameForm && <UsernameForm mode={usernameForm} busy={busy} onSubmit={submitUsername} onChange={changeUsernameForm} onBack={() => changeMode('signin')} />}
              {(showKakao || showGoogle) && methods.email && <p className="ons-account-divider">또는 이메일로</p>}
              {methods.email && !usernameForm && <>
                <form key={mode} onSubmit={submitAuth}>
                  {mode === 'signup' && <label>표시 이름<span className="ons-field-with-icon"><UserRound size={17} aria-hidden="true" /><input name="name" autoComplete="nickname" maxLength={60} required /></span></label>}
                  {mode !== 'reset' && <label>이메일<span className="ons-field-with-icon"><Mail size={17} aria-hidden="true" /><input name="email" type="email" autoComplete="email" maxLength={254} autoCapitalize="none" spellCheck={false} required /></span></label>}
                  {passwordField && (
                    <div className="ons-password-field">
                      <label htmlFor="ons-password">{mode === 'reset' ? '새 비밀번호' : '비밀번호'}</label>
                      <div className="ons-password-input ons-field-with-icon">
                        <LockKeyhole size={17} aria-hidden="true" />
                        <input id="ons-password" name="password" type={passwordVisible ? 'text' : 'password'}
                          minLength={mode === 'signin' ? 1 : 12} maxLength={128} spellCheck={false} autoCapitalize="none"
                          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                          aria-describedby={mode === 'signin' ? undefined : 'ons-password-hint'} required />
                        <button type="button" className="ons-password-toggle" aria-controls="ons-password"
                          aria-label={passwordVisible ? '비밀번호 숨기기' : '비밀번호 표시'} disabled={busy}
                          onClick={() => setPasswordVisible((visible) => !visible)}>
                          {passwordVisible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                        </button>
                      </div>
                      {mode === 'signin' ? (
                        <button type="button" className="ons-text-button ons-forgot" disabled={busy} onClick={() => changeMode('forgot')}>비밀번호 찾기</button>
                      ) : <p id="ons-password-hint" className="ons-field-hint">12자 이상으로 입력해 주세요.</p>}
                    </div>
                  )}
                  <button type="submit" className="ons-button ons-auth-submit" disabled={busy}>
                    {headings[mode]}<ArrowRight size={17} aria-hidden="true" />
                  </button>
                </form>
                {mode === 'signin' ? (
                  <nav className="ons-account-links" aria-label="다른 계정 작업">
                    <div><span>온스가 처음이라면</span><button type="button" className="ons-text-button" disabled={busy} onClick={() => changeMode('signup')}>회원가입</button></div>
                    <button type="button" className="ons-text-button ons-text-muted" disabled={busy} onClick={() => changeMode('verify')}>인증 메일 다시 보내기</button>
                  </nav>
                ) : (
                  <button type="button" className="ons-text-button ons-return" disabled={busy} onClick={() => changeMode('signin')}>
                    <ArrowLeft size={16} aria-hidden="true" />로그인으로 돌아가기
                  </button>
                )}
              </>}
              {showUsername && <button type="button" className={methods.email ? 'ons-text-button' : 'ons-google-button ons-username-button'} disabled={busy} onClick={() => changeUsernameForm('signin')}>
                <UserRound size={18} aria-hidden="true" />아이디로 로그인
              </button>}
              {!methods.email && !methods.google && !methods.kakao && !methods.username && <p className="ons-account-hint">현재 환경에서는 로그인 설정을 준비하고 있습니다.</p>}
            </div>
          ) : !error ? <p className="ons-account-hint" role="status">계정 정보를 불러오는 중입니다.</p> : null}
        </div>
      </section>
    </main>
  )
}
