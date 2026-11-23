import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { premiumEnabled } from './client'
import { usePremium } from './PremiumProvider'
import { ErrorNotice, Loading } from '../ui/Controls'

export function PremiumGate({ title, children }: { title: string; children: ReactNode }) {
  const { state, member, login, redeem, logout } = usePremium()
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const allowed = !premiumEnabled || Boolean(member?.premium)
  if (allowed) return <>{children}</>
  if (state === 'checking') return <Loading>이용권을 확인하는 중이에요.</Loading>

  async function onAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    try { await login(email, password, register); setPassword('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '로그인에 실패했습니다.') }
    finally { setBusy(false) }
  }
  async function onRedeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    try { await redeem(code); setCode('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '코드를 등록하지 못했습니다.') }
    finally { setBusy(false) }
  }

  return <div className="narrow-page">
    <section className="surface premium-panel" aria-label="유료 이용권 잠금">
      <span className="small-icon primary-icon"><LockKeyhole size={23} /></span>
      <span className="tag">유료 이용권</span>
      <h1>{title}</h1>
      <p className="dialog-description">2·3단계 학습과 실전 모의고사는 유료 이용권을 등록하면 계속 이용할 수 있어요. 1단계는 무료입니다.</p>
      {member ? <>
        <p className="premium-account">로그인: <strong>{member.email}</strong></p>
        <form onSubmit={(event) => void onRedeem(event)}>
          <div className="field">
            <label htmlFor="premium-code">1회용 이용권 코드</label>
            <input id="premium-code" autoComplete="off" placeholder="발급받은 32자리 코드" value={code}
              onChange={(event) => setCode(event.target.value)} required />
          </div>
          {error && <ErrorNotice message={error} />}
          <button className="button primary full" disabled={busy}>{busy ? '확인 중' : '코드 등록 · 전체 이용권 열기'} <ArrowRight size={17} /></button>
        </form>
        <button className="button secondary full" onClick={() => void logout()}>다른 계정으로 로그인</button>
      </> : <>
        <div className="mode-picker" role="group" aria-label="회원 메뉴">
          <button type="button" aria-pressed={!register} onClick={() => { setRegister(false); setError('') }}>로그인</button>
          <button type="button" aria-pressed={register} onClick={() => { setRegister(true); setError('') }}>회원가입</button>
        </div>
        <form onSubmit={(event) => void onAuth(event)}>
          <div className="field">
            <label htmlFor="premium-email">이메일</label>
            <input id="premium-email" type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="premium-password">비밀번호</label>
            <input id="premium-password" type="password" autoComplete={register ? 'new-password' : 'current-password'}
              minLength={register ? 12 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />
            {register && <p className="premium-help">12자 이상 · 계정 복구 기능은 운영 준비 후 제공됩니다.</p>}
          </div>
          {error && <ErrorNotice message={error} />}
          <button className="button primary full" disabled={busy}>{busy ? '처리 중' : register ? '무료 회원가입' : '로그인'} <ArrowRight size={17} /></button>
        </form>
      </>}
    </section>
  </div>
}
