import { ArrowLeft, ArrowRight, LockKeyhole, UserRound } from 'lucide-react'
import type { FormEventHandler } from 'react'

export function UsernameForm({ mode, busy, onSubmit, onChange, onBack }: {
  mode: 'signin' | 'signup'
  busy: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  onChange: (mode: 'signin' | 'signup') => void
  onBack: () => void
}) {
  const signup = mode === 'signup'
  return <>
    <form key={mode} onSubmit={onSubmit}>
      <label>아이디<span className="ons-field-with-icon"><UserRound size={17} aria-hidden="true" />
        <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={4} maxLength={24} required
          aria-describedby={signup ? 'ons-username-hint' : undefined} /></span>
        {signup && <span className="ons-field-hint" id="ons-username-hint">영문자·숫자로 시작하는 4~24자. 마침표, 밑줄, 하이픈을 쓸 수 있어요.</span>}
      </label>
      {signup && <label>표시 이름 <span className="ons-field-hint">선택</span><input name="name" autoComplete="nickname" maxLength={60} /></label>}
      <label>비밀번호<span className="ons-field-with-icon"><LockKeyhole size={17} aria-hidden="true" />
        <input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'}
          minLength={signup ? 12 : 1} maxLength={128} required aria-describedby={signup ? 'ons-username-password-hint' : undefined} /></span>
        {signup && <span className="ons-field-hint" id="ons-username-password-hint">12자 이상. 이메일로 비밀번호를 재설정할 수 없는 계정이에요.</span>}
      </label>
      <button type="submit" className="ons-button ons-auth-submit" disabled={busy}>
        {signup ? '아이디로 가입' : '아이디로 로그인'}<ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
    <button type="button" className="ons-text-button" disabled={busy} onClick={() => onChange(signup ? 'signin' : 'signup')}>
      {signup ? '아이디 로그인으로 돌아가기' : '아이디로 회원가입'}
    </button>
    <button type="button" className="ons-text-button ons-return" disabled={busy} onClick={onBack}>
      <ArrowLeft size={16} aria-hidden="true" />다른 로그인 방법
    </button>
  </>
}
