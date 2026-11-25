import { useEffect, useState, type FormEvent } from 'react'

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset'
type Methods = { email: boolean; google: boolean }
type Account = { user: { email: string; name: string }; access: { bookVerified: boolean; expiresAt: number | null } }

const headings: Record<Mode, string> = {
  signin: '로그인', signup: '회원가입', verify: '인증 메일 다시 보내기', forgot: '비밀번호 찾기', reset: '비밀번호 변경',
}

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

export function AccountPage() {
  const [resetToken] = useState(() => new URLSearchParams(location.search).get('token'))
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin')
  const [methods, setMethods] = useState<Methods | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    }).catch((failure) => {
      if (failure.name !== 'AbortError') setError('계정 상태를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.')
    })
    return () => controller.abort()
  }, [resetToken])

  function changeMode(next: Mode) {
    setMode(next)
    setNotice('')
    setError('')
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setNotice('')
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
    const callbackURL = location.origin + '/account'
    const args = {
      signin: { email, password }, signup: { email, password, name: form.get('name'), callbackURL },
      verify: { email, callbackURL }, forgot: { email, redirectTo: callbackURL }, reset: { token: resetToken, newPassword: password },
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
        const signedIn = await getAccount()
        if (!signedIn) throw new Error('Session missing')
        setAccount(signedIn)
      } else if (mode === 'reset') {
        setAccount(null)
        setMode('signin')
        setNotice('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.')
      } else {
        setNotice(mode === 'forgot'
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
      setAccount(await getAccount())
      setNotice('교재 이용권을 등록했습니다.')
    })
  }

  function googleSignIn() {
    void run(async () => {
      const result = await post('/auth/sign-in/social', {
        provider: 'google', callbackURL: location.origin + '/account', disableRedirect: true,
      })
      if (!result.ok) throw new Error('Google sign-in unavailable')
      const target = new URL((await result.json()).url)
      if (target.origin !== 'https://accounts.google.com') throw new Error('Invalid Google URL')
      location.assign(target.href)
    })
  }

  const showAccount = account && mode !== 'reset'
  return (
    <main className="ons-account" aria-busy={busy}>
      <h1>{showAccount ? '내 계정' : headings[mode]}</h1>
      {notice && <div className="ons-notice" role="status">{notice}</div>}
      {error && <div className="ons-error" role="alert">{error}</div>}
      {showAccount ? (
        <div className="ons-panel">
          <p className="ons-identity"><strong>{account.user.name}</strong><span>{account.user.email}</span></p>
          <p>{account.access.bookVerified && account.access.expiresAt !== null
            ? `교재 인증 이용권 · ${expiryDate.format(account.access.expiresAt - 1)}까지`
            : '무료 회원'}</p>
          {!account.access.bookVerified && (
            <form onSubmit={submitCode}>
              <label>교재 인증 코드<input name="code" maxLength={80} required autoComplete="off" /></label>
              <button type="submit" disabled={busy}>이용권 등록</button>
            </form>
          )}
          <button type="button" className="ons-secondary" disabled={busy} onClick={() => void run(async () => {
            if (!(await post('/auth/sign-out', {})).ok) throw new Error('Sign-out failed')
            setAccount(null)
            setMode('signin')
            setNotice('로그아웃했습니다.')
          })}>로그아웃</button>
        </div>
      ) : methods ? (
        <div className="ons-panel">
          {methods.google && mode === 'signin' && <button type="button" className="ons-secondary" disabled={busy} onClick={googleSignIn}>Google로 로그인</button>}
          {methods.email && <>
            <form key={mode} onSubmit={submitAuth}>
              {mode === 'signup' && <label>표시 이름<input name="name" autoComplete="nickname" maxLength={60} required /></label>}
              {mode !== 'reset' && <label>이메일<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
              {['signin', 'signup', 'reset'].includes(mode) && (
                <label>{mode === 'reset' ? '새 비밀번호' : '비밀번호'}
                  <input name="password" type="password" minLength={mode === 'signin' ? 1 : 12} maxLength={128}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
                </label>
              )}
              <button type="submit" disabled={busy}>{headings[mode]}</button>
            </form>
            <nav className="ons-actions" aria-label="다른 계정 작업">
              {(mode === 'signin' ? ['signup', 'verify', 'forgot'] as const : ['signin'] as const).map((next) => (
                <button key={next} type="button" disabled={busy} onClick={() => changeMode(next)}>{headings[next]}</button>
              ))}
            </nav>
          </>}
          {!methods.email && !methods.google && <p>현재 환경에서는 로그인 설정을 준비하고 있습니다.</p>}
        </div>
      ) : !error ? <p role="status">계정 정보를 불러오는 중입니다.</p> : null}
    </main>
  )
}
