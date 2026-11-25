import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, LogOut, Settings, UserMinus } from 'lucide-react'
import { useState, type FormEvent } from 'react'

const confirmation = '회원탈퇴'

export function AccountManagement({ busy, onSignOut, onWithdraw }: {
  busy: boolean
  onSignOut: () => void
  onWithdraw: (confirmation: string) => Promise<string | undefined>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (withdrawing || value !== confirmation) return
    setWithdrawing(true)
    setError('')
    try {
      setError(await onWithdraw(value) ?? '')
    } catch {
      setError('회원탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setWithdrawing(false)
    }
  }

  return <section className="ons-account-section ons-account-management" aria-labelledby="ons-management-heading">
    <h2 id="ons-management-heading"><Settings size={18} aria-hidden="true" />계정 관리</h2>
    <button type="button" className="ons-account-action" disabled={busy} onClick={onSignOut}>
      <LogOut size={17} aria-hidden="true" />로그아웃<ChevronRight size={16} aria-hidden="true" />
    </button>
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (withdrawing) return
      setOpen(next)
      setError('')
      setValue('')
    }}>
      <Dialog.Trigger asChild><button type="button" className="ons-account-action ons-danger-text" disabled={busy}>
        <UserMinus size={17} aria-hidden="true" />회원탈퇴<ChevronRight size={16} aria-hidden="true" />
      </button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ons-withdraw-overlay" />
        <Dialog.Content className="ons-withdraw-dialog">
          <Dialog.Title>회원탈퇴</Dialog.Title>
          <Dialog.Description>이 계정의 학습 진도, 구매 인증과 교재 이용권이 삭제됩니다. 탈퇴 후에는 복구할 수 없습니다.</Dialog.Description>
          {error && <p className="ons-error" role="alert">{error}</p>}
          <form onSubmit={submit} aria-busy={withdrawing}>
            <label htmlFor="ons-withdraw-confirm">확인란에 ‘회원탈퇴’를 입력하세요.</label>
            <input id="ons-withdraw-confirm" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" disabled={withdrawing} />
            <div className="ons-withdraw-actions">
              <Dialog.Close asChild><button type="button" className="ons-account-action" disabled={withdrawing}>취소</button></Dialog.Close>
              <button type="submit" className="ons-button ons-danger-button" disabled={withdrawing || value !== confirmation}>{withdrawing ? '처리 중' : '탈퇴 확정'}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </section>
}
