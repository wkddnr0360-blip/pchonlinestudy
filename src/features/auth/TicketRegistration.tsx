import { Ticket } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AccountActionDialog } from './AccountActionDialog'
import { TicketArt } from './TicketArt'

export function TicketRegistration({ onRedeem }: { onRedeem: (code: string) => Promise<string | undefined> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const code = String(new FormData(event.currentTarget).get('code') ?? '')
    setBusy(true)
    setError('')
    try {
      setError(await onRedeem(code) ?? '')
    } catch {
      setError('티켓을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return <AccountActionDialog title="교재 인증 티켓" description="이 계정에 발급된 1회용 티켓을 등록하세요."
    detail="발급받은 티켓 등록" icon={Ticket} gold busy={busy} onClose={() => setError('')}>
    {error && <p className="ons-error" role="alert">{error}</p>}
    <form onSubmit={submit} className="ons-ticket-form" aria-label="교재 인증 티켓" aria-busy={busy}>
      <TicketArt />
      <label>티켓 코드<span className="ons-field-with-icon"><Ticket size={17} aria-hidden="true" />
        <input name="code" maxLength={80} required autoComplete="off" spellCheck={false} disabled={busy} />
      </span></label>
      <button type="submit" className="ons-button" disabled={busy}><Ticket size={17} aria-hidden="true" />티켓 사용</button>
    </form>
  </AccountActionDialog>
}
