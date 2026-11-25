import { BookOpen, House, NotebookPen, UserRound } from 'lucide-react'
import { reviewHref } from '../../src/features/study/navigation'
import { PatchNotes } from './PatchNotes'
import onsIcon from '../../public/icons/ons-192.png'

const links = [
  { href: '/', label: '학습 홈', icon: House },
  { href: '/study', label: '학습', icon: BookOpen },
  { href: reviewHref, label: '오답노트', icon: NotebookPen },
  { href: '/account', label: '내 계정', icon: UserRound },
] as const

export function LearnerNav() {
  const { pathname, search } = window.location
  const current = pathname === '/study' && new URLSearchParams(search).get('view') === 'review' ? reviewHref
    : pathname === '/exam' ? '/study' : pathname
  const items = links.map(({ href, label, icon: Icon }) => <a key={href} href={href} aria-current={current === href ? 'page' : undefined}>
    <Icon size={21} aria-hidden="true" /><span>{label}</span>
  </a>)
  return <>
    <header className="ons-header">
      <div className="ons-header-inner ons-container">
        <a href="/" className="ons-brand"><img src={onsIcon} width="36" height="36" alt="" />박철한 온스</a>
        <nav className="ons-top-nav" aria-label="주 메뉴">{items}</nav>
        <PatchNotes />
      </div>
    </header>
    <nav className="ons-bottom-nav" aria-label="모바일 주 메뉴">{items}</nav>
  </>
}
