import { LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { premiumEnabled } from './client'
import { PremiumGate } from './PremiumGate'
import { usePremium } from './PremiumProvider'
import { Loading, ParagraphHeading } from '../ui/Controls'

export default function PremiumAccount() {
  const { state, member, logout } = usePremium()
  return <div className="narrow-page">
    <ParagraphHeading title="회원 및 이용권 관리" description="유료 이용권은 계정에 등록되며 같은 코드를 다른 계정에서 재사용할 수 없어요." />
    {!premiumEnabled
      ? <section className="surface premium-panel">
          <p>현재 사이트는 무료 운영 중입니다. 유료 이용권 발급은 정식 오픈 후 제공할 예정입니다.</p>
          <Link className="button primary" to="/">학습 홈으로</Link>
        </section>
      : state === 'checking'
        ? <Loading>회원 정보를 불러오는 중이에요.</Loading>
        : member?.premium
          ? <section className="surface premium-panel">
              <span className="small-icon primary-icon"><LockKeyhole size={23} /></span>
              <span className="tag">전체 이용권 활성화</span>
              <h2>2·3단계와 실전 모의고사 잠금이 해제되었습니다.</h2>
              <p className="premium-account">로그인: <strong>{member.email}</strong></p>
              <Link className="button primary full" to="/">학습 시작</Link>
              <button className="button secondary full" onClick={() => void logout()}>로그아웃</button>
            </section>
          : <PremiumGate title="유료 이용권 등록"><span /></PremiumGate>}
  </div>
}
