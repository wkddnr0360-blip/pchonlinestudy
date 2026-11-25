# 온스 2.0 검증 환경

## 디자인 미리보기

```sh
npm run build:ons2
npm run preview:ons2:design
```

`http://127.0.0.1:8788/?preview=free`에서 3단계 홈과 무료 회원의 잠금 상태를, `http://127.0.0.1:8788/study?stage=1`에서 편·장·절 목차와 합성 OX 학습을 확인한다. `http://127.0.0.1:8788/?preview=verified`을 열면 2·3단계와 실전 모의고사를 체험할 수 있다. 로그인, 황금 티켓, 관리자도 상단 미리보기 메뉴에서 연다. 미리보기 서버는 루프백 주소에만 열리고 합성 데이터로 응답한다. 계정 연결과 외부 전송은 실제 Worker에서 검증한다.

## 로컬 검증

```sh
npm ci
npm test
npm run build:ons2
npm run test:ons2:runtime
npm run db:ons2:local
npm run dev:ons2
```

로컬 Worker는 `http://127.0.0.1:8787`에서 연다. `.ons2/client`는 `build:ons2`가 만들며 로컬 D1·KV는 테스트용이다. `cloudflare/.dev.vars`에 임의로 생성한 32자 이상의 `BETTER_AUTH_SECRET`과 `AUTH_EMAIL_MODE=fixtures`를 넣으면 로컬 `@example.test` 메일만 로컬 D1의 `local_mail_fixtures`에 남는다. 브라우저 검증은 `npx playwright install chromium webkit` 후 `npm run test:ons2:browser`를 실행한다. 테스트는 임시 바인딩과 합성 계정을 사용한다.

기본 단위 테스트는 모의고사, 번호 범위, 오답 배치에 필요한 합성 자료를 생성한다. 실제 원본 비교가 필요하면 권한이 확인된 HWPX에서 `scripts/import_book.py`와 `scripts/verify_book.py`를 실행한다. 기존 Pages 테스트에서 그 로컬 자료를 읽으려면 `ONS_LEGACY_BOOK=1`을 사용한다. 그 로컬 Pages 빌드와 `dist`는 운영 배포나 CI 산출물로 사용하지 않는다.

## 계정 연결 준비

2026-11-26에 Wrangler 계정 연결 및 Codex의 공식 Cloudflare MCP OAuth를 확인했다. `pch-ons2-staging` D1과 `pch-ons2-mcp-staging` KV를 별도로 생성했다. 로컬의 두 스테이징 Wrangler 설정에는 리소스 ID를 넣었으며 Git에서 제외한다. 구매 인증은 앱 D1을 사용하고 공개 정적 파일은 Workers Static Assets가 제공한다. [Cloudflare Codex 설정](https://developers.cloudflare.com/agent-setup/prompt.md)

앱의 첫 스테이징은 [온스 2.0 스테이징](https://pch-ons2-staging.wkddnr0360.workers.dev/)에 배포했다. 앱의 비공개 API는 세션을 요구하고 공개 화면은 검색 로봇 색인 대상에서 제외했다. 현재 D1에 질문·회원·사진은 0건이다. 앱 전용 세션 키를 설치했으며 Google OAuth와 발신 메일 설정은 대기 중이다. Google에 등록할 스테이징 콜백 주소는 `https://pch-ons2-staging.wkddnr0360.workers.dev/api/v1/auth/callback/google`다.

1. 권리자의 교재 변환·서비스 제공 및 아트 사용 허락을 확인한다. 권한이 있는 비공개 개발 저장소와 합성 자료 전용 스테이징을 준비하고 운영 프로젝트와 분리한다.
2. Cloudflare 계정에서 스테이징 D1 데이터베이스와 MCP 전용 KV를 만든다. 두 `cloudflare/wrangler.*staging.example.jsonc` 템플릿을 같은 디렉터리에 복사하고 파일명에서 `.example`을 뺀 뒤 스테이징 계정·리소스 값을 채운다. 템플릿의 `workers_dev` 및 `preview_urls`는 기본 비활성이다. 접근 제한을 설정한 별도 스테이징 호스트명을 사용한다. [Wrangler 설정](https://developers.cloudflare.com/workers/wrangler/configuration/)
3. `APP_ORIGIN`에 스테이징의 HTTPS 원점을 입력한다. Google Cloud에서 테스트용 OAuth 웹 클라이언트를 만들고 `https://<스테이징 호스트>/api/v1/auth/callback/google`을 승인된 리디렉션 URI로 등록한다. 테스트 사용자도 추가한다. 이메일 인증과 재설정에 사용할 발신 도메인은 Resend에서 검증한다. 앱 Worker에 `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`을 각각 `npx wrangler secret put <이름> --config cloudflare/wrangler.staging.jsonc`로 등록한다. [Google 웹 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) · [Resend 이메일 API](https://resend.com/docs/api-reference/emails/send-email) · [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
4. 배포 전에 `npm run build:ons2`로 정적 파일 검사까지 실행하고, 스테이징 리소스 이름과 바인딩을 대조한다. 스테이징이 활성화되면 마이그레이션을 적용하고 Cloudflare Access 등에서 허용한 테스트 계정으로 Google 콜백, Resend 발송, 권한 회수, 만료, 직접 경로, 캐시를 확인한다. 결과는 DEVLOG에 기록한다. 운영 도메인과 Pages 이전은 별도 승인 뒤 진행한다.

## 기존 교재 노출 대응

- 교재 JSON 28개는 2026-11-25 GitHub 브랜치 4개의 이력에서 제거했다. 브랜치 이름과 교재 이외 파일은 보존했다. 현재 브랜치의 교재 경로에 다시 커밋하지 않도록 개발 브랜치에 `.gitignore`와 CI 검사를 추가했다. 이전 이력에서 받은 복제본은 깨끗한 재복제를 사용한다.
- 소유자 선택에 따라 운영 Pages는 유지했다. 이력으로부터 새 Pages 빌드를 실행하려면 권한이 있는 별도 자료 준비 경로가 필요하다. GitHub의 과거 커밋 주소, PR 내부 참조, 제3자 사본, 이미 설치된 PWA 캐시는 각각 별도 확인 대상이다. GitHub가 관리하는 내부 참조와 캐시의 처리 한계는 공식 정책을 따른다. [GitHub 이력 정리와 잔여 사본](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## 같은 주소에서 서비스 워커 전환

승인된 Workers 이관 때 기존 Pages와 동일한 HTTPS 주소의 루트에서 `LEGACY_PAGES_CACHE_MIGRATION=1`을 사용한다. 이전 앱은 갱신 표시를 통해 새 Worker를 설치하고, 진행 중인 학습·모의고사를 마친 뒤 사용자가 적용할 수 있다. 이미 있던 `?ons-retry=1` 경로로 캐시를 거치지 않고 새 화면을 여는 방법도 제공한다. 전환 Worker는 과거 온스 셸·교재 캐시만 지운다. IndexedDB 학습 기록과 계정 연동은 별도 P0-C 이관 범위다.

## 공개 정적 파일 캐시

콘텐츠 해시가 붙은 `/assets/`의 이미지·CSS·JS는 Workers Static Assets에서 제공한다. Cloudflare의 계층형 캐시를 사용하며 브라우저에는 `public, max-age=31536000, immutable`을 보낸다. 빌드에서 공개 파일 목록과 `_headers`를 검사한다. HTML, 세션, 교재 API, 관리자 구매 사진은 Worker의 `no-store` 규칙을 적용한다. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) · [Cloudflare 정적 파일 헤더](https://developers.cloudflare.com/workers/static-assets/headers/)

스테이징을 연 뒤 같은 해시 자산을 같은 위치에서 연속 요청해 `CF-Cache-Status`와 `ETag`를 확인한다. `/study` 셸·문제 API·구매 사진은 캐시되지 않아야 한다. 캐시 규칙을 추가할 경우 공개 해시 자산 경로만 지정한다. 배포 검증에서 API와 사진의 캐시 제외도 다시 확인한다.

## 스테이징 구매 인증 준비

1. 별도 D1에 `0008_purchase_photos.sql`까지 적용한다. 스테이징에서는 합성 교재 사진과 테스트 계정을 사용한다. 기존 R2 구현이 배포된 환경에서는 `SELECT COUNT(photo_key) FROM purchase_requests`로 이관 대상을 확인한다. 0건이면 사진 이관 없이 전환한다. 사진 경로가 남은 환경에서는 비공개 원본을 정상적으로 이관할 수 있을 때 전환한다. 새 D1 사진을 받은 뒤의 롤백은 D1 사진 테이블을 읽는 빌드를 사용한다.
2. 관리자용 이메일 계정으로 가입하고 이메일을 인증한다. 소유자가 D1에서 해당 계정 ID의 `member_roles`에 `admin` 역할을 추가한다. 회원 브라우저에는 권한 부여 경로가 없다. `/admin`에서 계정 비밀번호를 다시 입력하고 설정 키를 인증 앱에 직접 등록한다. 구매 목록과 사진 접근, 승인 및 티켓 발급·폐기에는 현재 관리자 역할과 15분 이내 인증 앱 코드 확인이 필요하다.
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

부여된 권한으로 실제 전체 교재를 사용할 수 있는 환경에서 목차명, 문항 수, 기출 출처를 대조한 뒤 운영 적용을 검토한다. 2026-11-26 외부 스테이징 D1에 목차·모의고사 마이그레이션을 적용하고 미적용 마이그레이션이 없음을 확인했다. 실제 교재 적재와 앱 로그인 연동은 대기 중이다.

`/study`에서 허용된 단계와 번호 범위, 답 제출 후 해설 표시, 오답 재풀이를 확인한다. 기존 OX 기록은 동일 주소의 브라우저 또는 온스 JSON 백업에서 선택하고, 이메일이 표시된 수신 계정으로 이관을 확정한다. 서버는 문제 번호, 사용자 답, 시각, 중복 식별자를 수신한다. 기존 시험 내용과 저장된 채점값은 브라우저에서 이관 요청에 포함하지 않는다. 기존 시험 및 오답 해소 상태는 후속 이관 범위다.

## 기본 OX 문항 분석

외부 스테이징에 `0009_study_statistics.sql`과 Worker `e81a47d7`를 적용했다. 현재 분석 플래그는 0이다. 새 컬럼을 넣기 이전의 풀이와 브라우저 이관 기록은 기존 진도에 반영된다. 문항 분석은 활성화 이후 기본 OX에서 받은 서명된 풀이를 기준으로 시작한다. 풀이 시간은 문제 전송과 제출 시각이 확인된 1초 이상 10분 이하 응답의 평균이다.

1. 별도 환경에 `0009_study_statistics.sql`을 적용한다. `npm run verify:ons2:statistics-schema`가 Drizzle Kit의 산출물을 임시 디렉터리에 생성하고 실제 Wrangler 마이그레이션의 컬럼·기본값·키를 대조한다. Wrangler가 적용 이력의 기준이다.
2. 분석을 활성화하기 전에 해당 계정의 Free 플랜을 확인한다. `ANALYTICS_ACCOUNT_ID`를 환경 변수로, **해당 계정만** 대상으로 한 `Account Analytics: Read` 토큰을 `ANALYTICS_METRICS_TOKEN` Worker 시크릿으로 넣는다. `ANALYTICS_ENABLED=1`과 매 5분 Cron `*/5 * * * *`을 설정하고 구매 사진의 매시간 Cron도 함께 등록한다. 대시보드 계정 지표가 연결되기 전에는 분석 플래그를 0으로 둔다. 로컬 테스트는 합성 지표를 사용한다. [Cloudflare Analytics 토큰](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)
3. 기본 OX 응답을 여러 회원으로 제출해 `/admin?view=statistics`에서 체크포인트, 표본, 지연 상태를 확인한다. 초과한 작업은 한국 시간 오전 9시 일일 한도 리셋 이후 재개한다. 사용량 없이 집계가 진행되지 않는지와 채점은 반환되는지도 확인한다. `npm run bench:ons2:statistics`의 100개 병렬 작업은 로컬 D1 쿼리 측정이다.
4. 오탈자와 의미를 유지한 교정은 새 리비전을 실제 출제판으로 전환하는 트랜잭션에서, 활성 리비전을 갱신하기 전에 `study_statistics_versions`에 새 리비전과 기존 통계 버전을 연결한다. 정답 또는 판단 기준이 바뀌면 새 리비전 자체가 통계 버전이 된다. 승인된 출제판 발행 흐름과 함께 적용한다.
5. 사용량 이상이나 롤백 시 `ANALYTICS_ENABLED=0`으로 배포하고 분석 Cron을 제거한다. 통계 마이그레이션의 컬럼·데이터를 보존해 이후 해당 체크포인트부터 재개할 수 있다. Cloudflare 계정 한도와 결제 정책은 계정 소유자 승인 후 변경한다. [D1 요금과 한도](https://developers.cloudflare.com/d1/platform/pricing/) · [Workers 지출 한도](https://developers.cloudflare.com/workers/platform/spend-management/)
