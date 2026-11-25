import { ArrowDown, ArrowRight, BookOpen, Camera, CircleCheck, TicketCheck, UserRoundPlus } from 'lucide-react'
import { AccountArtwork } from '../../src/features/auth/AccountArtwork'
import './home.css'

const steps = [
  { title: '계정 만들기', detail: '이메일이나 Google 계정으로 시작합니다.', icon: UserRoundPlus, tone: 'lilac' },
  { title: '교재 사진 제출', detail: '카페 닉네임을 적은 포스트잇과 교재를 촬영합니다.', icon: Camera, tone: 'mint' },
  { title: '황금 티켓 사용', detail: '심사 후 받은 1회용 티켓으로 정회원 이용권을 엽니다.', icon: TicketCheck, tone: 'gold' },
] as const

export function OnsHome() {
  return <main className="ons-home">
    <section className="ons-home-hero" aria-labelledby="ons-home-heading">
      <div className="ons-home-copy">
        <h1 id="ons-home-heading">경찰헌법 OX 학습<span>박철한 온스</span></h1>
        <p>내 계정에서 교재 구매를 인증하고 정회원 이용권을 준비하세요.</p>
        <div className="ons-home-actions">
          <a className="ons-button" href="/study"><BookOpen size={18} aria-hidden="true" />OX 학습 시작</a>
          <a className="ons-home-guide" href="/account">로그인 및 회원가입<ArrowRight size={16} aria-hidden="true" /></a>
          <a className="ons-home-guide" href="#book-access">교재 인증 안내<ArrowDown size={16} aria-hidden="true" /></a>
        </div>
      </div>
      <div className="ons-home-visual"><AccountArtwork stage={2} /></div>
    </section>
    <section id="book-access" className="ons-home-steps" aria-labelledby="ons-home-steps-title">
      <h2 id="ons-home-steps-title"><CircleCheck size={23} aria-hidden="true" />교재 인증 방법</h2>
      <ol>
        {steps.map(({ title, detail, icon: Icon, tone }) => <li key={title}>
          <span className={`ons-step-icon ons-step-${tone}`}><Icon size={23} aria-hidden="true" /></span>
          <div><h3>{title}</h3><p>{detail}</p></div>
        </li>)}
      </ol>
    </section>
  </main>
}
