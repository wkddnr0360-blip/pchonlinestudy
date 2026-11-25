import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft } from 'lucide-react'
import { AccountPage } from '../../src/features/auth/AccountPage'
import { PurchaseAdminPage } from '../../src/features/admin/PurchaseAdminPage'
import onsIcon from '../../public/icons/ons-192.png'
import './shell.css'

const onAccount = window.location.pathname === '/account'
const onAdmin = window.location.pathname === '/admin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <header className="ons-header">
      <a href="/" className="ons-brand">
        <img src={onsIcon} width="34" height="34" alt="" />
        <span>박철한 온스</span>
      </a>
      {onAccount || onAdmin
        ? <a className="ons-header-action" href="/"><ArrowLeft size={16} aria-hidden="true" />홈으로</a>
        : <a className="ons-header-action" href="/account">내 계정</a>}
    </header>
    {onAdmin ? <PurchaseAdminPage /> : onAccount ? <AccountPage /> : (
      <main className="ons-landing">
        <h1>박철한 온스 2.0</h1>
        <p>헌법 OX 학습을 준비하고 있습니다.</p>
        <a className="ons-button" href="/account">로그인 및 회원가입</a>
      </main>
    )}
  </StrictMode>,
)
