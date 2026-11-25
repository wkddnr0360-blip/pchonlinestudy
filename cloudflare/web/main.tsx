import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { OnsHome } from './OnsHome'
import { LearnerNav } from './LearnerNav'
import './shell.css'
import './stages.css'

const onAccount = window.location.pathname === '/account'
const onAdmin = window.location.pathname === '/admin'
const onStudy = window.location.pathname === '/study'
const onExam = window.location.pathname === '/exam'
const AccountPage = lazy(() => import('../../src/features/auth/AccountPage').then((module) => ({ default: module.AccountPage })))
const PurchaseAdminPage = lazy(() => import('../../src/features/admin/PurchaseAdminPage').then((module) => ({ default: module.PurchaseAdminPage })))
const StudyPage = lazy(() => import('../../src/features/study/StudyPage').then((module) => ({ default: module.StudyPage })))
const ExamPage = lazy(() => import('../../src/features/exam/ExamPage').then((module) => ({ default: module.ExamPage })))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {!onAdmin && <LearnerNav />}
    <Suspense fallback={<main className="ons-landing" role="status">화면을 불러오고 있습니다.</main>}>
      {onAdmin ? <PurchaseAdminPage /> : onAccount ? <AccountPage /> : onStudy ? <StudyPage /> : onExam ? <ExamPage /> : <OnsHome />}
    </Suspense>
  </StrictMode>,
)
