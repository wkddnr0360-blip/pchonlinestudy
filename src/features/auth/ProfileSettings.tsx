import { KeyRound, UserPen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AccountActionDialog } from './AccountActionDialog'

export function ProfileSettings({ name, canChangePassword, request, onNameChange }: {
  name: string
  canChangePassword?: boolean
  request: (path: string, body: object) => Promise<Response>
  onNameChange: (value: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean }>()

  async function submit(event: FormEvent<HTMLFormElement>, action: 'profile' | 'password') {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    if (action === 'password' && data.newPassword !== data.passwordConfirmation) {
      setMessage({ text: '새 비밀번호 확인이 일치하는지 확인해 주세요.', error: true })
      return
    }
    setMessage(undefined)
    setBusy(true)
    try {
      const result = await request('/account/' + action, data)
      if (result.status === 429) {
        setMessage({ text: '잠시 기다렸다 다시 시도해 주세요.', error: true })
      } else if (!result.ok) {
        setMessage({ text: action === 'profile' ? '닉네임을 확인해 주세요.' : '현재 비밀번호와 새 비밀번호를 확인해 주세요.', error: true })
      } else if (action === 'profile') {
        onNameChange((await result.json()).name)
        setMessage({ text: '닉네임을 저장했습니다.', error: false })
      } else {
        form.reset()
        setMessage({ text: '비밀번호를 변경하고 다른 기기의 로그인 세션을 종료했습니다.', error: false })
      }
    } catch {
      setMessage({ text: '변경을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return <AccountActionDialog title="회원 정보 수정" description="온스에서 사용하는 회원 정보를 관리하세요."
    detail={canChangePassword ? '닉네임 · 비밀번호' : '온스 닉네임'} icon={UserPen} busy={busy} onClose={() => setMessage(undefined)}>
    {message && <p className={message.error ? 'ons-error' : 'ons-notice'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <form onSubmit={(event) => void submit(event, 'profile')} aria-busy={busy}>
      <label>닉네임<input name="name" maxLength={60} required defaultValue={name} autoComplete="nickname" disabled={busy} /></label>
      <button type="submit" className="ons-button" disabled={busy}>닉네임 저장</button>
    </form>
    {canChangePassword && <details className="ons-password-details">
      <summary><KeyRound size={17} aria-hidden="true" />비밀번호 변경</summary>
      <form onSubmit={(event) => void submit(event, 'password')} aria-busy={busy}>
        <label>현재 비밀번호<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required disabled={busy} /></label>
        <label>새 비밀번호<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></label>
        <label>새 비밀번호 확인<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></label>
        <button type="submit" className="ons-button" disabled={busy}>새 비밀번호 저장</button>
      </form>
    </details>}
  </AccountActionDialog>
}
