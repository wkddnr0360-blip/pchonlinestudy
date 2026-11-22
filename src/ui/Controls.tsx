import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, X } from 'lucide-react'

export function Loading({ children = '불러오는 중이에요.' }: { children?: ReactNode }) {
  return <p className="status-card" role="status">{children}</p>
}

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="status-card error-card" role="alert">
    <AlertCircle size={20} aria-hidden="true" />
    <span>{message}</span>
    {retry && <button className="button secondary" onClick={retry}>다시 시도</button>}
  </div>
}

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); close() }}
    onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <div className="dialog-content">
      <header className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="닫기"><X size={22} /></button>
      </header>
      {children}
    </div>
  </dialog>
}

export function ParagraphHeading({ eyebrow, title, description }: {
  eyebrow?: string; title: string; description?: string
}) {
  return <header className="page-heading">
    {eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h1>{title}</h1>
    {description && <p>{description}</p>}
  </header>
}
