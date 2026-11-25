import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, UserRound } from 'lucide-react'
import { AccountPage } from '../../src/features/auth/AccountPage'
import { OnsHome } from './OnsHome'
import onsIcon from '../../public/icons/ons-192.png'
import './shell.css'

const onAccount = window.location.pathname === '/account'
const onAdmin = window.location.pathname === '/admin'
const onStudy = window.location.pathname === '/study'
const PurchaseAdminPage = lazy(() => import('../../src/features/admin/PurchaseAdminPage').then((module) => ({ default: module.PurchaseAdminPage })))
const StudyPage = lazy(() => import('../../src/features/study/StudyPage').then((module) => ({ default: module.StudyPage })))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {!onAdmin && <header className="ons-header">
      <a href="/" className="ons-brand">
        <img src={onsIcon} width="34" height="34" alt="" />
        <span>박철한 온스</span>
      </a>
      {onAccount
        ? <a className="ons-header-action" href="/"><ArrowLeft size={16} aria-hidden="true" />홈으로</a>
        : <a className="ons-header-action" href="/account"><UserRound size={17} aria-hidden="true" />내 계정</a>}
    </header>}
    {onAdmin ? <Suspense fallback={<main className="ons-landing" role="status">관리자 화면을 불러오고 있습니다.</main>}><PurchaseAdminPage /></Suspense>
      : onAccount ? <AccountPage /> : onStudy
        ? <Suspense fallback={<main className="ons-landing" role="status">학습 화면을 불러오고 있습니다.</main>}><StudyPage /></Suspense>
        : <OnsHome />}
  </StrictMode>,
)
