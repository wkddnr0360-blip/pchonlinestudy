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

## 학습 홈·계정 화면 개편과 가입 확인

- `cloudflare/web/{OnsHome,HomeStudySummary}.tsx`, `home.css`와 `stages.css`에 기존 공개판의 파란 학습 시작 영역과 실제 서버 문항 기준 진도를 반영했다. `src/features/study/{StageGallery,StageArtwork,StageMascot}.tsx`로 학습 카드와 원본 철한쌤 반응 버튼을 분리했다. 단계별 웃음·응원·불꽃 자세는 기존 스프라이트로 재생한다. 모션 줄이기에서는 표정만 바꾼다. [기존 공개판](https://pch.oxstudy.kro.kr/#/)
- `src/features/auth/{AccountPage,AccountActionDialog,AccountManagement,PurchaseForm,TicketRegistration,ProfileSettings}.tsx`에서 회원 상태, 교재 인증과 계정 메뉴를 한 화면으로 배치했다. 입력창은 모바일에서 하단 시트로, 데스크톱에서 대화상자로 열며 닫을 때 메뉴에 포커스를 돌린다. 기존 Radix Dialog와 Lucide를 사용했다. [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) · [Lucide](https://github.com/lucide-icons/lucide)
- `0010_registration_confirmation.sql`, `shared/registration.ts`, `worker/auth/{config,registration,username}.ts`와 `worker/routes/account.ts`에서 신규 가입의 자기확인·동의 버전·서버 확인 시각을 검증하고 저장한다. UI는 `RegistrationFields.tsx`와 `UsernameForm.tsx`에 연결했다. 최초 소셜 가입에는 신뢰한 OAuth 상태의 확인이 필요하며, 기존 카카오 계정의 재로그인을 합성 콜백으로 검증했다. `worker/auth/profile.ts`는 세션 소유자의 닉네임 변경과 비밀번호 변경을 처리한다. 비밀번호 변경은 Better Auth를 호출하고 다른 세션을 종료한다. [Better Auth](https://better-auth.com/docs/concepts/database)
- `LegalPage.tsx`, `legal.css`, Worker 셸과 로컬 미리보기에 `/terms`·`/privacy`를 연결했다. 시행일, 책임자와 연락처, 보안 기록 기간, 실제 위탁 계약 주체와 국외 이전 세부 항목은 운영 확정 전이다. 표준 Self-Serve 계약에는 Cloudflare, Inc.로 기재돼 있다. 스테이징 D1 정보에서 구체적인 국가나 관할 값은 반환되지 않았다. [Cloudflare 계약](https://www.cloudflare.com/terms/) · [데이터 위치](https://developers.cloudflare.com/d1/configuration/data-location/)
- 단위 22개, 로컬 Worker 12개, Chromium·WebKit 19개와 정적 자산 32개를 검증했다. 320·390·701·768·1080·1280px에서 단계 글과 원 사이 간격 8px 이상을 확인했다. 주요 캡처는 `.ons2/qa/home-1280.png`, `home-390.png`, `account-sections-390.png`, `purchase-sheet-390.png`, `username-signup-390.png`다. Pages 빌드는 통과했다. Pages E2E는 포트 4173 충돌로 시작하지 못했고 실교재 검증은 로컬 Python 실행 및 원본 부재로 완료하지 못했다.
- 스테이징 D1에 `0010`을 적용했고 대기 마이그레이션은 0개다. Worker 버전 `4408e84a`와 로컬 포트 8787에서 최신 번들을 확인했다. 실제 스테이징에서 가입 확인 누락 및 비밀번호 불일치 거절, Google·카카오 가입 시작, 합성 아이디 가입·로그인·닉네임 및 비밀번호 변경·이전 세션 차단을 확인했다. 확인 후 합성 회원을 탈퇴시켰다. 장애 시 스테이징 UI 변경 범위만 되돌리고 서버 가입 확인과 추가 스키마는 보존한다.

## 실제 교재 적재와 OX 풀이

- 사용자 제공 HWPX에서 재정규화한 판본은 `3f81c1c4298504cd`다. 함께 받은 ZIP의 manifest와 장 JSON 27개가 전부 일치했다. 1단계 504개, 2단계 1,355개, 3단계 1,270개와 원본의 문제·해설 짝 및 세로 위치를 확인했다. `scripts/verify_book.py --root`로 비공개 폴더를 직접 검증할 수 있다. 기존 Pages에서 서비스 중인 1단계 504개도 같은 판본과 일치했다.
- 로컬과 스테이징 D1에 교재와 목차 74개를 적재했다. 첫 원격 파일 적재에서 문항과 리비전의 외래 키 오류로 롤백됐다. `scripts/prepare_ons2_book.mjs`에서 임시 테이블과 한 트리거로 전체 교재를 확정하도록 변경한 뒤 스테이징 문항·리비전 각 3,129개, 임시 객체 0개를 확인했다. 별도 SQLite 검증에서 지문, 출처, 정오 표식, 해설 블록·표까지 3,129개를 대조했다. [D1 외래 키](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- `src/features/study/{StudyReader,StudyPage}.tsx`, `study-reader.css`에서 모바일 풀이를 단계·번호·현재 위치, 지문과 기출 출처, O/X, 안내와 해설, 이전·다음으로 배치했다. 데스크톱은 문제와 해설을 나란히 표시한다. 한 풀이 안에서 이전 문제로 돌아가도 선택과 채점 결과가 유지된다.
- 단위 22개, Worker 12개, Chromium·WebKit 19개, 정적 자산 32개 및 Pages 빌드가 통과했다. 로컬 390px에서 실제 98번의 `1 / 37`과 O 선택, 정답·원문 해설, 99번 이동 후 복귀를 확인했다. 캡처는 `.ons2/private/real-book/`에 있다. 기존 Pages E2E는 포트 4173 충돌로 시작하지 못했다.
- 외부 스테이징 Worker `69b1107c`에서 비로그인 문항 접근 401, 과거 공개 JSON 경로 404, 무료 계정의 1단계 504문항과 2·3단계 차단을 확인했다. 같은 임시 회원으로 교재 티켓을 등록해 전체 3,129문항, 목차 74개, 585번 표 해설과 1892번 해설의 두 블록을 원본과 대조했다. 배포된 화면에서 98번 출처와 채점 후 해설, 99번 이동 및 98번 복귀도 확인했다. 검증용 계정은 탈퇴 처리했다. UI 롤백이 필요하면 스테이징 Worker만 되돌리고 D1 원본과 풀이 기록을 보존한다.
