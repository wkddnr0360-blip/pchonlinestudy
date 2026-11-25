import * as Dialog from '@radix-ui/react-dialog'
import { Bell, X } from 'lucide-react'
import { useState } from 'react'

const release = 'ons2-stage-ui'
const storageKey = 'ons2-patch-notes-seen'

export function PatchNotes() {
  const [unread, setUnread] = useState(() => {
    try { return localStorage.getItem(storageKey) !== release } catch { return true }
  })

  function acknowledge(open: boolean) {
    if (!open) return
    setUnread(false)
    try { localStorage.setItem(storageKey, release) } catch { /* The indicator still clears for this visit. */ }
  }

  return <Dialog.Root onOpenChange={acknowledge}>
    <Dialog.Trigger asChild>
      <button type="button" className="ons-icon-button ons-notes-trigger" title="패치노트" aria-label={unread ? '패치노트 · 새 소식' : '패치노트'}>
        <Bell size={22} aria-hidden="true" />{unread && <i aria-hidden="true" />}
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="ons-stage-overlay" />
      <Dialog.Content className="ons-stage-dialog ons-notes-dialog">
        <Dialog.Close asChild><button type="button" className="ons-icon-button ons-stage-dialog-close" aria-label="패치노트 닫기"><X size={22} aria-hidden="true" /></button></Dialog.Close>
        <Dialog.Title>패치노트</Dialog.Title>
        <Dialog.Description>온스 2.0 개발판</Dialog.Description>
        <ul>
          <li>홈에서 1·2·3단계의 철한쌤과 이용 상태를 바로 확인할 수 있어요.</li>
          <li>학습할 목차와 문제 수를 고르고, 채점이 끝나면 해설과 오답을 확인할 수 있어요.</li>
        </ul>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
