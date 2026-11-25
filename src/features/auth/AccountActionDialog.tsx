import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, X, type LucideIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

export function AccountActionDialog({ title, description, detail, icon: Icon, gold, busy, onClose, children }: {
  title: string
  description: string
  detail: string
  icon: LucideIcon
  gold?: boolean
  busy: boolean
  onClose?: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return <Dialog.Root open={open} onOpenChange={(next) => {
    if (busy) return
    setOpen(next)
    if (!next) onClose?.()
  }}>
    <Dialog.Trigger asChild>
      <button type="button" className="ons-account-option" aria-label={title} aria-describedby={detailId}>
        <span className={gold ? 'ons-account-option-icon ons-account-option-gold' : 'ons-account-option-icon'}><Icon size={19} aria-hidden="true" /></span>
        <span><strong>{title}</strong><small id={detailId}>{detail}</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="ons-withdraw-overlay" />
      <Dialog.Content className="ons-account-action-dialog">
        <header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close asChild><button type="button" className="ons-icon-button" aria-label="닫기" disabled={busy}><X size={20} aria-hidden="true" /></button></Dialog.Close>
        </header>
        <Dialog.Description>{description}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
