# Codex 실행 지시 — 박철한 온스 2.0 통합 개발

## 작업 대상
- 저장소: wkddnr0360-blip/pchonlinestudy
- 시작 브랜치: feature/cloudflare-admin-mcp (main에 직접 작업하지 말 것)
- 읽기: AGENTS.md, docs/ONS2-CODEX-MASTERPLAN.md, docs/TOWER-ART-DIRECTION.md, docs/DEVLOG.md, 기존 tests 및 premium 브랜치 차이.
- 본 문서는 실행용 요약이며 상세 계약/검수는 마스터 명세 및 아트 가이드를 따른다. 사용자 확정 사항이 과거 초안보다 우선한다.

## 확정 요구사항
1. TypeScript/React/Vite 유지, GitHub Pages 정적 사이트를 Cloudflare Workers + Static Assets + D1으로 전환. 구매 사진은 D1에 비공개 저장한다. 별도 인증 MCP Worker/KV, 스테이징 격리, 기존 도메인 유지 가능성 확인. 현재 public Git 이력의 전체 교재 노출 위험 해결 및 권리자 허락 확보가 선행 조건. 실자료/비밀키를 공개 저장소나 AI 로그에 넣지 말 것.
2. Google·카카오 OAuth와 계정 기반 진도 동기화. 카카오는 이메일 제공 없이 가입할 수 있다. 자체 이메일 로그인과 복구는 발신 설정이 있는 환경에서만 제공한다. 네이버 로그인과 PG 결제는 이번 제외. 카페 닉네임+교재 손글씨 포스트잇 사진 제출→관리자 검토→계정에 귀속된 일회용 코드→이용권. 2027-03-14까지 KST, 다음날 00시 exclusive. 유료회원은 교재 인증 회원의 의미.
3. 무료: 1단계 일반 학습, 번호 지정, 1단계 오답, 탑 일반모드 1단계 100%, Bronze/Silver 상한. 인증: 3,129문항 전체, 실전 모의고사, 일반모드 1/2단계, Gold 해금, 도전모드 2/3단계 50:50. 1문항 정답=1층. 경쟁 랭킹/명예의 전당/플래티넘·다이아는 인증 회원 전용. 무료 개인 티어와 경쟁 순위 분리, 기본 분모=유효 인증 Bronze 이상(언랭/무료 제외), P+D 상위 10% 및 D 상위 1% 상한, 골드 이상+서버 검증 도전 기록만 후보.
4. 프리시즌 후 14일 단위 시즌 1/2/... 자동 운영. 매 시즌 탑 진척·점수·티어 리셋. 직전 시즌 유효 최고 P/D 달성자만 다음 시즌 Gold seed(유효 이용권 필요), 그 외 Unranked. 교재 진도·오답·이용권·이전 시즌 기록 보존. 명시적 시즌 마감/스냅샷/멱등 재시작.
5. 원본 철한쌤 캐릭터 3종 및 한국풍 서재 참조. 브/실/골/플/다 캐릭터/복장/법전/배경. 무조건 고퀄 2D 도트 픽셀 아트, 실제 프레임 스프라이트 시트, 2D 카메라 스크롤·픽셀 타일맵. 3D/3D풍/실사/벡터 리깅/일러스트 단순 움직임 금지. Phaser+Pixelorama+Tiled, 아트 가이드 검수 우선. 일반 학습 UI는 Apple-inspired 미니멀 반응형 React DOM.
6. 관리자 페이지: 통계, 교재 인증/코드/회원, 문제 검색·오류 신고·정오/해설/법령 판례 검증·수정 미리보기/승인/이력/롤백, 시즌/랭킹/부정 기록, 보안·감사·릴리스. GPT MCP 동일 서비스 레이어, OAuth+scope+현재 관리자 검증, preview/apply+expected revision+idempotency+audit. 원문 불변, revision overlay. 실제 ChatGPT 연결과 호출 테스트.
7. 기존 기능과 교재 번호/표/출처/원문/오답/기록 보존, 시작~끝 번호/한 문제 선택 및 빠른 범위 UI, 접근성, 모바일·태블릿·PC, PWA 안전 업데이트. 서버 권한 및 채점, 문제·정답·해설 대량 노출 방지, 인증 콘텐츠를 정적 번들/SW/IndexedDB/백업에 금지, 계정 간 데이터 격리. 서버에서 만료/회수/순위/시간/문제 풀 판정.

## 실행 순서
- P0-A: baseline 테스트와 위험 분석, 저장소 정리/비공개 운영 계획, 환경별 Worker/D1/KV, synthetic fixtures. 권리자/소유자 승인 없이는 실자료 공개 및 운영 전환 금지.
- P0-B: migrations, auth/이메일/Google, 보안 세션, 구매 신청/코드/entitlement, 관리자 UI.
- P0-C: 문제·채점·모의고사 API, 계정 진도 저장, PWA, 문제 수정 MCP 및 감사, 실제 연동.
- P1-A: 디자인 토큰 및 반응형 UX, 상태별 UI, Storybook/Playwright visual/axe.
- P1-B: 무료/인증 탑 일반모드 및 Gold gate, 도전모드, 서버 점수·순위, 14일 시즌, 관리자·MCP 시즌/분포 검증.
- P1-C: 원본 대비 5티어 실제 픽셀 정지 시트 + climb 루프 먼저 승인, Phaser 모션과 타일맵, 모바일 실측 후 확장.
- P2: 통계/새 시즌 및 교재 확장. 각 단계 별도 PR·검증. 전체 프레임워크 재작성 금지.

## 권장 기술
Hono/Drizzle/Better Auth/Zod/Cloudflare Agents SDK/공식 MCP SDK, React Router/Lucide/TanStack Query/Radix 또는 shadcn, CSS tokens/React Hook Form, Phaser/Pixelorama/Tiled, Vitest/Workers integration/Miniflare/Playwright/Storybook/axe-core/ESLint/Prettier. Resend는 이메일 서비스 후보. 설치 전 현재 공식 문서·라이선스·호환성·잠금 버전을 확인하고 중복 도구 도입 금지.

## 운영 승인과 보고
Cloudflare/Google/메일 계정 연결·권리 확인은 소유자에게 필요한 단계만 안내하고 토큰/비밀번호는 채팅에 요구하지 말 것. 실제 리소스 ID/secret은 환경에 등록. 운영 main/DNS/DB/회원 데이터 및 배포는 승인 전 변경 금지. 매 작업마다 실제 변경 파일·커밋·테스트 명령/결과·미완료/실패·스크린샷·롤백 방법을 DEVLOG에 기록. 현재 랭킹 및 번호 지정 코드는 순수 정책/개발 초안이며 UI·서버와 미연결 또는 검증 대기. 명세만 존재하는 기능을 완료라고 기록 금지.

## 제안값 (프리시즌 검증 후 확정)
Silver 50, Gold 200 고유 정답, 인증 일반모드 1/2단계 50:50, 도전 하트 3·시간 30~60초·P 최소20층/D 최소40층, 랭크 5분 갱신, 프리시즌 7~14일, 코드 7일 만료. 무료→인증 전환 시 해당 시즌 고유 정답 유지, Gold seed의 분모 포함 및 프리시즌 carry 적용은 제안. 사용자 승인 없이 제안값을 운영 정책으로 확정하지 말 것. 권리자 동의와 실제 계정 설정·배포는 아직 미완료.

구매 승인 사진은 승인 시각부터 7일 후 자동 파기한다. 승인·티켓·이용권 기록은 보존한다. 반려·재제출 사진의 보관 기간은 환경별 설정으로 관리한다.
