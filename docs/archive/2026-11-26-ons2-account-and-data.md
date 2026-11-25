# 2026-11-26 · 온스 2.0 계정과 교재 적재

## 카카오 로그인 도입

- `worker/auth/{config,kakao}.ts`, `worker/routes/account.ts`, `src/features/auth/AccountPage.tsx`에 카카오 OAuth와 공식 로그인 버튼을 추가했다. 카카오 회원번호로 계정을 식별하고 닉네임을 요청한다. 스테이징 Worker `64545330`에서 신규 번들과 Google 로그인 시작, 합성 Worker에서 카카오 콜백과 같은 계정의 티켓 해금을 확인했다. 당시 단위 22개, Worker 10개, 브라우저 17개 및 정적 자산 28개 검사를 통과했다. [카카오 로그인 버튼](https://developers.kakao.com/tool/resource/login)
- Cloudflare Email Sending 화면에 선택 가능한 DNS 존이 없었고 CLI에서도 `onstudy.kro.kr` 존을 찾지 못했다. Free는 사전 검증한 수신자에게만 발송한다. 신규 회원 발송은 등록 가능한 발신 도메인과 Workers Paid가 필요하다. [Cloudflare 발신 도메인](https://developers.cloudflare.com/email-service/configuration/domains/) · [요금표](https://developers.cloudflare.com/email-service/platform/pricing/)

## 계정 화면과 관리자

- 카카오 스테이징 앱에 OAuth 콜백과 닉네임 동의를 설정하고 Worker 시크릿을 연결했다. 실제 회원의 카카오 로그인 화면을 확인했다. 앱 콘솔의 `account_email`은 ‘권한 없음’이다. 로그인 동의에는 이메일을 추가하지 않았다. [카카오 동의항목](https://developers.kakao.com/docs/ko/kakaologin/utilize)
- `worker/auth/{username,rate-limit,config}.ts` 및 `worker/routes/account.ts`에서 이메일·전화번호 없이 아이디와 비밀번호를 등록한다. Better Auth의 해싱과 세션을 사용하고 회원 및 자격 증명을 같은 D1 배치로 저장한다.
- `src/features/auth/{AccountPage,UsernameForm,PurchaseForm,AccountManagement}.tsx`와 `account.css`에서 Google을 맨 위에 배치하고, 이용 상태·교재 구매 인증·교재 인증 티켓·계정 관리를 구분했다. `worker/auth/withdraw.ts`는 최근 세션과 확인 문구를 검증하고 회원 본인의 데이터를 삭제한다. 로그인 이메일과 아이디가 없는 카카오 계정은 로그인 방법을 표시한다.
- `worker/auth/admin.ts`, `worker/routes/account.ts`, `src/features/admin/PurchaseAdminPage.tsx`에서 검증된 Google 관리자도 최신 세션에서 인증 앱을 등록할 수 있다. D1에서 지정 계정의 관리자 역할 1건을 등록하고 재조회했다. 사용자 인증 앱 등록은 해당 계정 소유자가 진행한다.
- 스테이징 Worker `be5ab2f1`에서 Google·카카오 시작, 일회용 테스트 계정의 가입·로그인·권한 차단·탈퇴와 탈퇴 뒤 세션 거절을 확인했다. 단위 22개, Worker 12개, Chromium·WebKit 18개, 정적 자산 28개 및 기존 Pages 빌드를 통과했다. 기존 Pages E2E는 포트 4173 충돌로 시작되지 않았다. `verify:book`은 로컬 `python3` 실행 오류와 실제 교재 부재로 완료하지 못했다.

## 교재 적재와 기본 OX 통계

- 관리 권한을 등록한 스테이징 D1에서 교재 0문항과 집계 커서 0을 확인했다. 기존 정규화본을 제공했던 `public/book/manifest.json`은 현재 GitHub 브랜치 네 곳에서 404다. 문항을 적재하기 전에 정규화 폴더와 장별 JSON 27개에서 1단계 504개, 2단계 1,355개, 3단계 1,270개를 검증한다.
- Drizzle Kit와 Wrangler 마이그레이션의 새 통계 테이블 4개에서 컬럼과 외래 키가 일치했다. `scripts/benchmark_ons2_statistics.mjs`에서 회원 수를 받아 최대 100개씩 병렬 처리한다. 합성 회원 1,000명 검증에서 기존과 통계 저장 모두 오류 0건, 쓰기 6행, 읽기 약 7→14행, P95 1,645→2,169ms였다. 1,000개 표본을 한 번씩 집계했고 Drizzle과 네이티브 조회 결과가 일치했다. 로컬 SQL 배치 지연을 측정한 값이다.
- 집계의 일일 예약 한도는 읽기 25만 행과 쓰기 1만 행이다. 실제 분석은 비공개 교재 적재 및 계정 읽기 전용 지표 연결 뒤에 켠다. 출제판 수정 발행 흐름과 실제 Cloudflare CPU·비용 검증이 남아 있다. [검증 환경](../ONS2-STAGING.md#기본-ox-문항-분석)
