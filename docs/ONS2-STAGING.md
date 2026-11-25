# 온스 2.0 검증 환경

## 로컬 검증

```sh
npm ci
npm test
npm run build:ons2
npm run test:ons2:runtime
npm run dev:ons2
```

로컬 Worker는 Wrangler가 출력하는 주소에서 연다. `.ons2/client`는 `build:ons2`가 만들며 로컬 D1·R2·KV는 테스트용이다. 기본 단위 테스트는 모의고사, 번호 범위, 오답 배치에 필요한 합성 자료를 생성한다. 실제 원본 비교가 필요하면 권한이 확인된 HWPX에서 `scripts/import_book.py`와 `scripts/verify_book.py`를 실행한다. 기존 Pages 테스트에서 그 로컬 자료를 읽으려면 `ONS_LEGACY_BOOK=1`을 사용한다. 그 로컬 Pages 빌드와 `dist`는 운영 배포나 CI 산출물로 사용하지 않는다.

## 계정 연결 준비

1. 권리자의 교재 변환·서비스 제공 및 아트 사용 허락을 확인한다. 권한이 있는 비공개 개발 저장소와 합성 자료 전용 스테이징을 준비하고 운영 프로젝트와 분리한다.
2. Cloudflare 계정에서 스테이징 D1 데이터베이스, private R2 버킷, MCP 전용 KV를 만든다. R2의 Public Development URL과 Custom Domain을 모두 비활성으로 유지한다. 두 `cloudflare/wrangler.*staging.example.jsonc` 템플릿을 같은 디렉터리에 복사하고 파일명에서 `.example`을 뺀 뒤 스테이징 계정·리소스 값을 채운다. 템플릿의 `workers_dev` 및 `preview_urls`는 기본 비활성이다. 접근 제한을 설정한 별도 스테이징 호스트명을 사용한다. [Wrangler 설정](https://developers.cloudflare.com/workers/wrangler/configuration/) · [R2 공개 설정](https://developers.cloudflare.com/r2/buckets/public-buckets/)
3. OAuth 단계에서 Google Cloud의 테스트용 OAuth 웹 클라이언트를 만든다. 스테이징 호스트와 앱이 사용하는 정확한 Google 콜백 URL을 등록하고 승인된 테스트 계정으로 확인한다. 이메일 공급자는 별도 발신 도메인을 확인한다. 앱 및 공급자의 키는 Worker Secret으로 등록한다. 로컬용 값은 Git에서 제외된 `.dev.vars`에만 둔다. OAuth 경로와 Secret 이름은 P0-B 구현에서 확정한다. [Google 웹 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) · [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
4. 배포 전에 `npm run build:ons2`로 정적 파일 검사까지 실행하고, 스테이징 리소스 이름과 바인딩을 대조한다. 스테이징에서 인증·권한 회수·만료·직접 경로·캐시를 검증한 뒤 결과를 DEVLOG에 기록한다. 운영 도메인과 Pages 이전은 별도 승인 뒤 진행한다.

## 기존 교재 노출 대응

- 교재 JSON 28개는 2026-11-25 GitHub 브랜치 4개의 이력에서 제거했다. 브랜치 이름과 교재 이외 파일은 보존했다. 현재 브랜치의 교재 경로에 다시 커밋하지 않도록 개발 브랜치에 `.gitignore`와 CI 검사를 추가했다. 이전 이력에서 받은 복제본은 깨끗한 재복제를 사용한다.
- 소유자 선택에 따라 운영 Pages는 유지했다. 이력으로부터 새 Pages 빌드를 실행하려면 권한이 있는 별도 자료 준비 경로가 필요하다. GitHub의 과거 커밋 주소, PR 내부 참조, 제3자 사본, 이미 설치된 PWA 캐시는 각각 별도 확인 대상이다. GitHub가 관리하는 내부 참조와 캐시의 처리 한계는 공식 정책을 따른다. [GitHub 이력 정리와 잔여 사본](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
