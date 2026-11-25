# 온스 2.0 검증 환경

## 디자인 미리보기

```sh
npm run build:ons2
npm run preview:ons2:design
```

`http://127.0.0.1:8788/?preview=free`에서 3단계 홈과 무료 회원의 잠금 상태를, `http://127.0.0.1:8788/study?stage=1`에서 편·장·절 목차와 합성 OX 학습을 확인한다. `http://127.0.0.1:8788/?preview=verified`을 열면 2·3단계와 실전 모의고사를 체험할 수 있다. 로그인, 황금 티켓, 관리자 화면은 상단 미리보기 메뉴에서 확인한다. 디자인 미리보기는 루프백 주소에서 합성 데이터로 응답한다. 가입 및 로그인을 처리하는 로컬 Worker 주소는 `http://127.0.0.1:8787/account`다.

## 로컬 검증

```sh
npm ci
npm test
npm run build:ons2
npm run test:ons2:runtime
npm run db:ons2:local
npm run dev:ons2
```

로컬 Worker는 `http://127.0.0.1:8787`에서 연다. `.ons2/client`는 `build:ons2`가 만들며 로컬 D1·KV는 테스트용이다. `cloudflare/.dev.vars`에 임의로 생성한 32자 이상의 `BETTER_AUTH_SECRET`과 `AUTH_EMAIL_MODE=fixtures`를 넣으면 로컬 `@example.test` 메일만 로컬 D1의 `local_mail_fixtures`에 남는다. 로컬 가입 화면에서 `demo@example.test` 같은 테스트 이메일을 입력하고, 양식 제출 후 **테스트 메일 링크 열기**를 눌러 인증한다. 비밀번호 재설정도 같은 방식이다. 테스트 메일 링크는 로컬 테스트 환경에서 생성된 요청의 응답으로만 돌아온다. 브라우저 검증은 `npx playwright install chromium webkit` 후 `npm run test:ons2:browser`를 실행한다. 테스트는 임시 바인딩과 합성 계정을 사용한다.

기본 단위 테스트는 모의고사, 번호 범위, 오답 배치에 필요한 합성 자료를 생성한다. 실제 원본 비교가 필요하면 권한이 확인된 HWPX에서 `scripts/import_book.py`와 `scripts/verify_book.py`를 실행한다. 기존 Pages 테스트에서 그 로컬 자료를 읽으려면 `ONS_LEGACY_BOOK=1`을 사용한다. 그 로컬 Pages 빌드와 `dist`는 운영 배포나 CI 산출물로 사용하지 않는다.

## 계정 연결 준비

2026-11-26에 Wrangler 계정 연결 및 Codex의 공식 Cloudflare MCP OAuth를 확인했다. `pch-ons2-staging` D1과 `pch-ons2-mcp-staging` KV를 별도로 생성했다. 로컬의 두 스테이징 Wrangler 설정에는 리소스 ID를 넣었으며 Git에서 제외한다. 구매 인증은 앱 D1을 사용하고 공개 정적 파일은 Workers Static Assets가 제공한다. [Cloudflare Codex 설정](https://developers.cloudflare.com/agent-setup/prompt.md)

앱의 첫 스테이징은 [온스 2.0 스테이징](https://pch-ons2-staging.wkddnr0360.workers.dev/)에 배포했다. 앱의 비공개 API는 세션을 요구하고 공개 화면은 검색 로봇 색인 대상에서 제외했다. 첫 배포 시 D1의 질문·회원·사진은 0건이었다. 스테이징 Worker의 세션 키와 Google OAuth 키가 설정되어 있다. Google Cloud `pchoxstudy` 프로젝트의 `ONS 2.0 Staging` 웹 클라이언트에 `https://pch-ons2-staging.wkddnr0360.workers.dev/api/v1/auth/callback/google`을 등록했다. Resend가 `onstudy.kro.kr`을 무료 공개 도메인으로 거부해 이메일 회원가입과 재설정은 발신 설정 전까지 비활성화 상태다.

1. 권리자의 교재 변환·서비스 제공 및 아트 사용 허락을 확인한다. 권한이 있는 비공개 개발 저장소와 합성 자료 전용 스테이징을 준비하고 운영 프로젝트와 분리한다.
2. Cloudflare 계정에서 스테이징 D1 데이터베이스와 MCP 전용 KV를 만든다. 두 `cloudflare/wrangler.*staging.example.jsonc` 템플릿을 같은 디렉터리에 복사하고 파일명에서 `.example`을 뺀 뒤 스테이징 계정·리소스 값을 채운다. 템플릿의 `workers_dev` 및 `preview_urls`는 기본 비활성이다. 접근 제한을 설정한 별도 스테이징 호스트명을 사용한다. [Wrangler 설정](https://developers.cloudflare.com/workers/wrangler/configuration/)
3. `APP_ORIGIN`에 스테이징의 HTTPS 원점을 입력한다. Google Cloud에서 테스트용 OAuth 웹 클라이언트를 만들고 `https://<스테이징 호스트>/api/v1/auth/callback/google`을 승인된 리디렉션 URI로 등록한다. 현재 로그인에 요청하는 `openid`, `email`, `profile`만 사용하면 Google 테스트 사용자 등록은 생략할 수 있다. 이메일 인증과 재설정에 사용할 발신 도메인은 Resend에서 검증한다. 앱 Worker에 `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`을 각각 `npx wrangler secret put <이름> --config cloudflare/wrangler.staging.jsonc`로 등록한다. [Google OAuth 게시 상태](https://support.google.com/cloud/answer/15549945) · [Resend 발신 도메인](https://resend.com/docs/dashboard/domains/introduction) · [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
4. 배포 전에 `npm run build:ons2`로 정적 파일 검사까지 실행하고, 스테이징 리소스 이름과 바인딩을 대조한다. 스테이징이 활성화되면 마이그레이션을 적용하고 Cloudflare Access 등에서 허용한 테스트 계정으로 Google 콜백, Resend 발송, 권한 회수, 만료, 직접 경로, 캐시를 확인한다. 결과는 DEVLOG에 기록한다. 운영 도메인과 Pages 이전은 별도 승인 뒤 진행한다.

### 카카오 로그인 연결

1. 카카오디벨로퍼스에서 온스 개발용 앱을 선택하고 카카오 로그인을 사용 설정한다. REST API 키의 카카오 로그인 리다이렉트 URI에 `https://pch-ons2-staging.wkddnr0360.workers.dev/api/v1/auth/callback/kakao`를 등록한다. 닉네임(`profile_nickname`) 동의항목을 설정한다. [카카오 로그인 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)
2. REST API 키와 클라이언트 시크릿을 스테이징 Worker의 `KAKAO_CLIENT_ID`와 `KAKAO_CLIENT_SECRET` 시크릿으로 각각 등록한다. `npx wrangler secret put <이름> --config cloudflare/wrangler.staging.jsonc`가 표시하는 프롬프트에 입력한다. 두 시크릿이 설정되면 `/api/v1/auth-methods`의 `kakao`가 `true`가 되고 계정 화면에 버튼이 나타난다. [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
3. 카카오 스테이징 앱에서 실제 회원 로그인을 확인했다. 동의항목의 `account_email`은 ‘권한 없음’이며 이메일을 요청하지 않는다. `user.email`의 내부 `.invalid` 값은 Better Auth 호환용이고, 회원 인증은 `account`의 카카오 계정으로 확인한다. 화면이나 메일에 내부 주소를 사용하지 않는다. 연결된 카카오 앱을 교체하면 앱별 회원번호가 달라지므로 별도의 계정 이관이 필요하다. [카카오 동의항목](https://developers.kakao.com/docs/ko/kakaologin/utilize) · [카카오 회원번호](https://developers.kakao.com/docs/ko/kakaologin/common)

### 아이디 로그인과 계정 관리

`/account`에서 Google, 카카오, 아이디 순서로 로그인한다. 아이디는 영문 소문자·숫자로 시작하며 마침표, 밑줄, 하이픈을 포함해 4~24자를 사용할 수 있다. 대문자는 소문자로 저장하고 비밀번호는 12자 이상을 받는다. 아이디 가입은 비밀번호 확인과 닉네임을 요구한다. 이메일이나 전화번호를 저장하지 않는 아이디 가입에는 이메일 재설정이 제공되지 않는다.

가입 단계에서 만 14세 이상 자기확인과 이용약관 동의가 필요하다. 간편 회원가입을 선택하면 같은 확인 항목이 표시되며, 확인한 회원가입 요청의 OAuth 상태만 신규 사용자 등록을 허용한다. `0010_registration_confirmation.sql`을 먼저 적용한다. 확인 정보는 새로 가입한 계정에 기록한다. `/terms`와 `/privacy`는 스테이징 검토용 초안이며, 운영 시행일, 보호 담당자·문의 이메일, 보안 기록 기간, 위탁 법인과 국외 이전 정보를 확인한 뒤 운영 문서와 약관 버전을 확정한다. [개인정보 보호법](https://www.law.go.kr/법령/개인정보보호법) · [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) · [D1 데이터 위치](https://developers.cloudflare.com/d1/configuration/data-location/)

내 계정에서 교재 구매 인증·티켓·회원 정보 수정은 해당 행을 눌러 연다. 닉네임은 계정의 표시 이름에만 반영한다. 비밀번호 계정은 현재 비밀번호 확인 뒤 새 비밀번호를 저장하고 다른 세션을 종료한다. 회원탈퇴에는 최근 로그인과 확인 문구가 필요하고, 카카오 계정의 경우 연결 해제 후 계정을 삭제한다.

### Cloudflare 이메일 발송 조건

2026-11-26에 온보딩 화면에서 발신에 선택할 수 있는 존이 없음을 확인했다. 계정에서 `onstudy.kro.kr`의 DNS 존을 찾지 못했고, `kro.kr`은 공개 접미사 목록에 없다. 도메인 등록 경로와 네임서버 제어를 확보한 뒤부터 발송 전환을 진행할 수 있다. Free는 Cloudflare 계정에서 사전 확인한 수신 주소에만 발송한다. 일반 회원 가입에는 Workers Paid도 필요하다. 도메인을 준비한 뒤 기존 Better Auth와 D1을 사용하면서 발송 함수에 Cloudflare `send_email` 바인딩을 연결할 수 있다. [DNS 도메인 등록](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/) · [이메일 발송 요금](https://developers.cloudflare.com/email-service/platform/pricing/) · [회원가입 발송 예제](https://developers.cloudflare.com/email-service/examples/email-sending/signup-flow/)

## 기존 교재 노출 대응

- 교재 JSON 28개는 2026-11-25 GitHub 브랜치 4개의 이력에서 제거했다. 브랜치 이름과 교재 이외 파일은 보존했다. 현재 브랜치의 교재 경로에 다시 커밋하지 않도록 개발 브랜치에 `.gitignore`와 CI 검사를 추가했다. 이전 이력에서 받은 복제본은 깨끗한 재복제를 사용한다.
- 소유자 선택에 따라 운영 Pages는 유지했다. 이력으로부터 새 Pages 빌드를 실행하려면 권한이 있는 별도 자료 준비 경로가 필요하다. GitHub의 과거 커밋 주소, PR 내부 참조, 제3자 사본, 이미 설치된 PWA 캐시는 각각 별도 확인 대상이다. GitHub가 관리하는 내부 참조와 캐시의 처리 한계는 공식 정책을 따른다. [GitHub 이력 정리와 잔여 사본](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## 같은 주소에서 서비스 워커 전환

승인된 Workers 이관 때 기존 Pages와 동일한 HTTPS 주소의 루트에서 `LEGACY_PAGES_CACHE_MIGRATION=1`을 사용한다. 이전 앱은 갱신 표시를 통해 새 Worker를 설치하고, 진행 중인 학습·모의고사를 마친 뒤 사용자가 적용할 수 있다. 이미 있던 `?ons-retry=1` 경로로 캐시를 거치지 않고 새 화면을 여는 방법도 제공한다. 전환 Worker는 과거 온스 셸·교재 캐시만 지운다.

## 공개 정적 파일 캐시

콘텐츠 해시가 붙은 `/assets/`의 이미지·CSS·JS는 Workers Static Assets에서 제공한다. Cloudflare의 계층형 캐시를 사용하며 브라우저에는 `public, max-age=31536000, immutable`을 보낸다. 빌드에서 공개 파일 목록과 `_headers`를 검사한다. HTML, 세션, 교재 API, 관리자 구매 사진은 Worker의 `no-store` 규칙을 적용한다. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) · [Cloudflare 정적 파일 헤더](https://developers.cloudflare.com/workers/static-assets/headers/)

스테이징을 연 뒤 같은 해시 자산을 같은 위치에서 연속 요청해 `CF-Cache-Status`와 `ETag`를 확인한다. `/study` 셸·문제 API·구매 사진은 캐시되지 않아야 한다. 캐시 규칙을 추가할 경우 공개 해시 자산 경로만 지정한다. 배포 검증에서 API와 사진의 캐시 제외도 다시 확인한다.

## 스테이징 구매 인증 준비

1. 별도 D1에 `0008_purchase_photos.sql`까지 적용한다. 스테이징에서는 합성 교재 사진과 테스트 계정을 사용한다. 기존 R2 구현이 배포된 환경에서는 `SELECT COUNT(photo_key) FROM purchase_requests`로 이관 대상을 확인한다. 0건이면 사진 이관 없이 전환한다. 사진 경로가 남은 환경에서는 비공개 원본을 정상적으로 이관할 수 있을 때 전환한다. 새 D1 사진을 받은 뒤의 롤백은 D1 사진 테이블을 읽는 빌드를 사용한다.
2. 소유자가 이메일이 검증된 Google 또는 이메일 인증 계정의 ID를 확인하고, 스테이징 D1의 `member_roles`에 `admin` 역할을 추가한다. `/admin`에서 설정 키를 인증 앱에 등록한다. 등록 전 Google 계정은 10분 이내 로그인 세션이 필요하며, 비밀번호 계정은 비밀번호를 다시 입력한다. 구매 목록과 사진 접근, 승인 및 티켓 발급·폐기에는 현재 관리자 역할과 15분 이내 인증 앱 코드 확인이 필요하다.
3. `PURCHASE_TICKET_TTL_HOURS`에 승인한 티켓 유효 시간을 설정한다. 로컬 테스트의 168시간은 운영 정책 제안값이다. 발급 직후 코드가 한 번 표시되며 관리자가 등록된 신청자에게 승인된 비공개 경로로 전달한다. 화면을 닫은 코드를 다시 조회할 수 없어 분실 시 재발급 절차를 사용한다.
4. 브라우저에서 JPEG로 압축하고 512 KiB 이하로 제출한다. Worker는 JPEG 구조 검증과 메타데이터 제거 후 신청과 사진을 같은 D1 트랜잭션에 저장한다. 관리자 목록은 사진의 존재 여부만 읽으며 본문은 확인 버튼을 눌렀을 때 2단계 인증과 역할을 확인한 뒤 제공한다. 300장 기준 본문은 최대 150 MiB다. [D1 한도](https://developers.cloudflare.com/d1/platform/limits/)
5. 앱 Worker에 매시간 Cron Trigger를 설정한다. 승인 7일이 지나면 사진 행을 파기하고 감사 이력을 남긴다. 심사 대기 사진은 심사를 위해 보관한다. 반려·재제출 사진은 `PURCHASE_PHOTO_RETENTION_DAYS`를 설정한 환경에서 처리 시각을 기준으로 정리하며 로컬은 30일이다. 구매 승인, 티켓, 회원 이용권은 보존한다. 무료 D1의 Time Travel 이력에는 삭제된 사진이 최대 7일 더 남을 수 있다. 복구 시에는 앱을 열기 전에 만료 사진 정리를 실행하고 조회를 확인한다. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [D1 복구 이력](https://developers.cloudflare.com/d1/reference/time-travel/)

## 스테이징 학습 검증

`0005_study.sql`은 교재 번호와 단계, 수정 버전 및 OX 풀이 사건을 저장한다. 이 마이그레이션에는 교재 데이터가 없다. 로컬 브라우저와 Worker 통합 테스트가 `tests/ons2-book-fixture.mjs`의 합성 문제를 임시 D1에 삽입한다. 교재 원문은 권한이 확인된 별도 입력과 이관 검증을 거친다.

`0006_book_outline.sql`에 원본 편·장·절 이름과 쪽수를, `0007_mock_exam.sql`에 서버 시험과 답안을 저장한다. 실제 교재를 로컬 D1에 연결할 때 기존 정규화 디렉터리와 단계별 장 파일을 그대로 사용한다. 다음 명령은 기존 파일의 3,129개 식별자와 목차 집계를 검증한 뒤 Git에서 제외된 위치에 SQL을 만든다. 실제 자료를 적재할 DB는 비어 있는 별도 로컬 DB로 지정한다.

```sh
node scripts/prepare_ons2_book.mjs "/path/to/normalized-book/manifest.json"
npm run db:ons2:local
npx wrangler d1 execute DB --local --file .ons2/private/normalized-book.sql --config cloudflare/wrangler.local.jsonc
```

부여된 권한으로 실제 전체 교재를 사용할 수 있는 환경에서 목차명, 문항 수, 기출 출처를 대조한 뒤 운영 적용을 검토한다. 외부 스테이징 D1에 목차·모의고사 마이그레이션을 적용했다. 스테이징의 교재는 0문항이고, 2026-11-26에 GitHub의 현재 브랜치 4개에서 기존 `public/book/manifest.json`이 제거된 것을 재확인했다. 권한이 확인된 비공개 정규화본이 적재에 필요하다.

`/study`에서 허용된 단계와 번호 범위, 답 제출 후 해설 표시, 오답 재풀이를 확인한다. 계정 화면의 기존 OX 진도 가져오기 경로는 종료했다. D1에 이미 저장된 가져오기 기록은 기존 진도 응답에 포함한다.

## 기본 OX 문항 분석

외부 스테이징에 `0009_study_statistics.sql`과 Worker `e81a47d7`를 적용했다. 현재 분석 플래그는 0이다. 새 컬럼을 넣기 이전의 풀이와 브라우저 이관 기록은 기존 진도에 반영된다. 문항 분석은 활성화 이후 기본 OX에서 받은 서명된 풀이를 기준으로 시작한다. 풀이 시간은 문제 전송과 제출 시각이 확인된 1초 이상 10분 이하 응답의 평균이다.

1. 별도 환경에 `0009_study_statistics.sql`을 적용한다. `npm run verify:ons2:statistics-schema`가 Drizzle Kit의 산출물을 임시 디렉터리에 생성하고 실제 Wrangler 마이그레이션의 컬럼·기본값·키를 대조한다. Wrangler가 적용 이력의 기준이다.
2. 분석을 활성화하기 전에 해당 계정의 Free 플랜을 확인한다. `ANALYTICS_ACCOUNT_ID`를 환경 변수로, **해당 계정만** 대상으로 한 `Account Analytics: Read` 토큰을 `ANALYTICS_METRICS_TOKEN` Worker 시크릿으로 넣는다. `ANALYTICS_ENABLED=1`과 매 5분 Cron `*/5 * * * *`을 설정하고 구매 사진의 매시간 Cron도 함께 등록한다. 대시보드 계정 지표가 연결되기 전에는 분석 플래그를 0으로 둔다. 로컬 테스트는 합성 지표를 사용한다. [Cloudflare Analytics 토큰](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)
3. 기본 OX 응답을 여러 회원으로 제출해 `/admin?view=statistics`에서 체크포인트, 표본, 지연 상태를 확인한다. 초과한 작업은 한국 시간 오전 9시 일일 한도 리셋 이후 재개한다. 사용량 없이 집계가 진행되지 않는지와 채점은 반환되는지도 확인한다. `npm run bench:ons2:statistics -- 1000`은 100개씩 병렬로 실행하는 로컬 D1 쿼리 측정이며 실제 Worker 트래픽의 측정치와 구분한다.
4. 오탈자와 의미를 유지한 교정은 새 리비전을 실제 출제판으로 전환하는 트랜잭션에서, 활성 리비전을 갱신하기 전에 `study_statistics_versions`에 새 리비전과 기존 통계 버전을 연결한다. 정답 또는 판단 기준이 바뀌면 새 리비전 자체가 통계 버전이 된다. 승인된 출제판 발행 흐름과 함께 적용한다.
5. 사용량 이상이나 롤백 시 `ANALYTICS_ENABLED=0`으로 배포하고 분석 Cron을 제거한다. 통계 마이그레이션의 컬럼·데이터를 보존해 이후 해당 체크포인트부터 재개할 수 있다. Cloudflare 계정 한도와 결제 정책은 계정 소유자 승인 후 변경한다. [D1 요금과 한도](https://developers.cloudflare.com/d1/platform/pricing/) · [Workers 지출 한도](https://developers.cloudflare.com/workers/platform/spend-management/)

합성 회원 1,000명 측정에서 기본 OX 채점의 쓰기는 풀이당 6행으로 유지됐고, 읽기는 약 7행에서 14행으로 늘었다. 300명이 하루 30문제씩 풀면 측정한 경로에서 약 12만 6천 행을 읽고 5만 4천 행을 쓴다. 통계 작업의 일일 예약분까지 더하면 약 37만 6천 읽기와 6만 4천 쓰기로, Free 계정 한도인 500만 읽기와 10만 쓰기 이내다. 1,000명이 각각 30문제를 푸는 날은 기본 OX 쓰기만 약 18만 행으로 Free 쓰기 한도를 넘는다. Paid의 월 $5 기본료가 적용될 경우 이 규모에서 측정한 월 540만 채점 쓰기는 포함량 5천만 행 안에 든다. 실제 사용량에는 로그인, 구매 사진, 결과 조회, 모의고사와 다른 Worker 사용량이 더해진다. Workers의 지출 한도는 계정의 요청과 CPU 요금에 적용되며 D1은 별도 사용량으로 추적한다. [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/) · [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/) · [Workers 지출 한도](https://developers.cloudflare.com/workers/platform/spend-management/)
