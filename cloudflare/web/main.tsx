import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountPage } from '../../src/features/auth/AccountPage'
import './shell.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <header className="ons-header"><a href="/">박철한 온스</a><a href="/account">내 계정</a></header>
    {window.location.pathname === '/account' ? <AccountPage /> : (
      <main className="ons-landing">
        <h1>박철한 온스 2.0</h1>
        <p>헌법 OX 학습을 준비하고 있습니다.</p>
        <a className="ons-button" href="/account">로그인 및 회원가입</a>
      </main>
    )}
  </StrictMode>,
)
