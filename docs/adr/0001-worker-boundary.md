# ADR 0001 · Workers 전환 시 공개 산출물 경계

## 결정

- 기존 Vite Pages 진입점은 운영 이관 과정의 회귀 검증에 사용한다. `cloudflare/vite.config.ts`는 같은 React·TypeScript·Vite 의존성을 사용하는 별도 Workers 진입점이다. 기능별로 기존 모듈을 이관한다.
- Workers 빌드는 `publicDir`와 Vite 환경 파일 읽기를 비활성화한다. 클라이언트는 파일 경로로 지정한 철한쌤 캐릭터와 앱 아이콘만 기존 `public/`에서 가져온다. 테스트·합성 시드·Worker·기존 공개 자료 모듈이 번들에 포함되면 빌드가 실패한다. 배포 대상은 `.ons2/client`다. 검증기는 허용 파일 목록과 알려진 교재·키 패턴을 검사한다.
- 앱 Worker는 Static Assets보다 먼저 요청을 받는다. 합의된 경로만 라우팅하고, 나머지는 404 JSON으로 응답한다. 비공개 R2 객체나 알 수 없는 API가 HTML이나 공개 파일 응답으로 바뀌지 않는다. 서버 바인딩이 빠지면 503을 반환한다.
- D1은 계정·이용권·진도·변경 이력의 원장으로 사용한다. 구매 사진과 읽기 전용 교재 원본은 private R2에 둔다. 별도 MCP Worker만 OAuth KV를 사용하고 앱과는 서비스 바인딩으로 연결한다. MCP 엔드포인트는 인증 구현 전까지 503을 반환한다.
- P0-A는 Wrangler를 단일 Worker 도구로 채택했다. Wrangler와 내부 Miniflare가 제공하는 통합 테스트 하네스로 설정 파일과 두 Worker를 함께 검증한다. 별도 Vite 플러그인이나 추가 Miniflare 버전에 대한 필요가 확인되면 재검토한다. Wrangler 및 Worker 타입은 MIT/Apache-2.0 이중 라이선스이고 기존 Node 24에서 잠근 버전을 사용한다. [Wrangler API](https://developers.cloudflare.com/workers/wrangler/api/) · [Static Assets 바인딩](https://developers.cloudflare.com/workers/static-assets/binding/)

## 이후 이관

- P0-B에서 이 앱에 로그인·교재 구매 검토를 붙인다. P0-C에서 문제/채점/시험을 한 문항 단위 API로 전환하고 PWA 갱신·기기 진도 이관을 구현한다. 교재 원본과 기존 ID는 권한이 승인된 보관본에서 대조한다.
- Workers 롤백은 코드를 이전에 검증한 Workers 버전으로 되돌리는 방식으로 설계한다. 과거 교재가 포함된 Git 이력의 복구나 재게시를 피한다.
