import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react'
import { registrationTermsVersion } from '../../../shared/registration'
import { approvedPurchasePhotoRetentionDays } from '../../../shared/purchase'
import './legal.css'

function Terms() {
  return <>
    <h2>제1조(목적)</h2>
    <p>온스는 수험생의 학습을 지원하기 위한 학습 서비스입니다.</p>
    <h2>제2조(회원가입 및 계정 관리)</h2>
    <p>만 14세 이상인 이용자가 가입할 수 있습니다. 회원은 자신의 계정을 안전하게 관리해야 하며, 타인의 정보를 도용하거나 계정을 무단으로 공유·판매해서는 안 됩니다.</p>
    <h2>제3조(금지행위)</h2>
    <p>회원은 다음 행위를 해서는 안 됩니다.</p>
    <ul>
      <li>매크로 및 자동화 프로그램을 이용한 부정행위</li>
      <li>학습 기록, 점수 및 랭킹 조작</li>
      <li>콘텐츠의 무단 복제·판매·배포</li>
      <li>서비스의 정상적인 운영을 방해하는 행위</li>
    </ul>
    <h2>제4조(이용 제한)</h2>
    <p>운영자는 약관 위반 정도에 따라 서비스 이용을 제한할 수 있습니다. 회원은 제한 사유에 대해 이의를 제기할 수 있습니다.</p>
    <h2>제5조(서비스 운영)</h2>
    <p>서비스는 운영상 필요한 경우 변경되거나 중단될 수 있으며, 중요한 변경사항은 사전에 안내합니다.</p>
    <h2>제6조(회원탈퇴)</h2>
    <p>회원은 언제든지 회원탈퇴를 요청할 수 있으며, 개인정보는 관계 법령 및 개인정보 처리방침에 따라 처리합니다.</p>
  </>
}

function Privacy() {
  return <>
    <p>온스는 개인정보 보호법에 따라 이용자의 개인정보를 보호합니다.</p>
    <h2>1. 개인정보 항목 및 이용 목적</h2>
    <ul>
      <li>아이디, 비밀번호 해시, 닉네임은 회원 관리와 로그인에 사용합니다.</li>
      <li>Google 계정의 인증 식별자·이메일·프로필 정보와 카카오 계정의 인증 식별자·제공에 동의한 닉네임은 간편 로그인에 사용합니다.</li>
      <li>만 14세 이상 자기확인과 약관 동의 버전·시각은 가입 요건 확인에 사용합니다.</li>
      <li>문제풀이와 학습 기록은 학습 서비스 제공에 사용합니다.</li>
      <li>카페 닉네임과 제출 사진은 교재 구매 확인에 사용합니다.</li>
      <li>접속 IP, 브라우저 정보와 이용 기록은 서비스 보안과 부정행위 방지에 사용합니다.</li>
    </ul>
    <p>서비스 제공에 필요한 정보는 개인정보 보호법 제15조 제1항 제4호 등 해당하는 근거에 따라 처리합니다.</p>
    <h2>2. 보유기간 및 파기</h2>
    <p>회원정보와 학습 기록은 회원탈퇴 시까지 보유합니다. 처리 목적이 달성된 개인정보는 관계 법령에 따른 보존 의무가 있는 경우를 제외하고 파기합니다.</p>
    <p>승인된 교재 사진은 승인일로부터 {approvedPurchasePhotoRetentionDays}일 뒤 운영 DB에서 삭제합니다. 보안 기록 및 기타 구매 사진의 운영 보유기간은 확정 전입니다.</p>
    <h2>3. 개인정보 제공 및 처리 위탁</h2>
    <p>개인정보는 이용자의 동의 또는 법적 근거가 있는 경우에 제3자에게 제공합니다.</p>
    <dl>
      <dt>서비스 제공업체</dt><dd>Cloudflare</dd>
      <dt>위탁업무</dt><dd>웹 호스팅, 데이터 저장 및 보안</dd>
      <dt>계약 주체 및 국외 이전</dt><dd>계약 주체, 이전 국가·항목·근거·시기와 방법, 수탁자 연락처, 이전 목적·보유기간과 거부 방법·효과는 확인 후 기재합니다.</dd>
    </dl>
    <h2>4. 개인정보 보호</h2>
    <p>비밀번호 해시 저장, HTTPS 통신과 접근권한 관리 등 보호조치를 시행합니다. 로그인 유지에 필요한 쿠키를 사용하며, 브라우저에서 쿠키를 제한하면 로그인 등 일부 기능이 제한될 수 있습니다.</p>
    <h2>5. 이용자의 권리</h2>
    <p>이용자는 개인정보 열람·정정·삭제·처리정지 및 회원탈퇴를 요청할 수 있습니다. 회원탈퇴는 내 계정에서 요청할 수 있습니다.</p>
    <h2>6. 개인정보 보호 담당자 및 문의</h2>
    <p>보호 담당자와 문의 이메일은 확정 후 게시합니다. 개인정보 침해 상담은 국번 없이 118 또는 개인정보분쟁조정위원회 1833-6972를 이용할 수 있습니다.</p>
  </>
}

export function LegalPage({ privacy }: { privacy: boolean }) {
  const Icon = privacy ? ShieldCheck : FileText
  return <main className="ons-container ons-legal">
    <a className="ons-legal-return" href="/account"><ArrowLeft size={18} aria-hidden="true" />내 계정으로</a>
    <article aria-labelledby="ons-legal-title">
      <header>
        <Icon size={24} aria-hidden="true" />
        <h1 id="ons-legal-title">{privacy ? '온스 개인정보 처리방침' : '온스 서비스 이용약관'}</h1>
        <p>스테이징 검토용 초안 · {registrationTermsVersion}</p>
        <p>운영 시행일 확정 전</p>
      </header>
      {privacy ? <Privacy /> : <Terms />}
    </article>
  </main>
}
