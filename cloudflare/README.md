# 박철한 온스: 일회용 유료 이용권 운영 안내

> **미배포 Draft**: 실제 Cloudflare 배포 및 비공개 문제 데이터 이전 전에는 main에 병합하지 않는다.

## 접근 정책
- 1단계: 무료.
- 2단계, 3단계, 실전 모의고사 및 유료 문제 오답 복습: 유료.
- 1회용 코드: **최초 등록 1회만 허용**하며, 해당 회원 계정에 **무기한 전체 이용권**을 부여한다. 시험 1회권이 아니다.
- 회원: 이메일+비밀번호로 가입(최소 12자). 비밀번호 재설정·이메일 소유 확인은 아직 미구현.
- 자동 PG 결제는 아직 없음. 관리자 발급 후 수동 전달하는 방식이다.
- 기존 기기별 IndexedDB 학습 기록은 유지되며, 계정을 바꾼다고 기록이 동기화되는 것은 아니다.

## 중요한 선행 보안 조치
현재 공개 GitHub 저장소의 public/book 폴더에는 2단계 1,355문항, 3단계 1,270문항 및 해설이 노출돼 있다. 또한 이전 Git 커밋/기존 GitHub Pages 배포/사용자 PWA 캐시에 데이터가 남아 있을 수 있다.

1. **교재 내용을 유료 온라인으로 제공할 권리자 동의** 및 판매 조건을 확인한다.
2. 2·3단계 파일을 Cloudflare R2의 **공개 URL이 없는 비공개 버킷**에 업로드한다.
3. 유료 문항 JSON을 공개 정적 배포 폴더에서 제거하고 빌드 결과에도 포함되지 않는지 확인한다. 원본 교재 데이터 정합성 검증이 깨지지 않게 빌드/공개 경로를 분리해야 한다.
4. 공개 저장소 과거 이력에서는 삭제 후에도 내용이 남으므로 **신규 비공개 저장소와 콘텐츠 새 버전**을 활용하는 재배포를 검토한다. 이미 내려받은 데이터는 회수 불가하다.
5. API 배포 및 정상 인증 확인 후에만 프런트 빌드 변수 **VITE_PREMIUM_API_URL**을 지정한다. 미설정 배포는 레거시 공개 모드로 남는다.
6. 프런트 서비스 워커는 현재 same-origin 공개 book JSON을 캐싱한다. 과거 버전과 캐시의 유료 파일 접근 가능성도 확인한다. 신규 Cloudflare 프리미엄 응답은 no-store이며 이 캐시에 들어가지 않는다.
7. 실제 상용 서비스 전 이메일 검증, 비밀번호 복구, 탈퇴 및 환불, 개인정보처리방침, 이용약관, 불법 공유 대응, WAF/Turnstile, 과세 및 PG 계약을 보강한다.

## Cloudflare 준비
Cloudflare 계정에서 다음을 실행한다.

~~~sh
npx wrangler@latest login
npx wrangler@latest d1 create pchonlinestudy-premium
npx wrangler@latest r2 bucket create pchonlinestudy-premium-book
~~~

D1 출력의 database_id를 **cloudflare/wrangler.toml**에 입력한다. BOOK_VERSION은 교재 버전과 같아야 한다. ADMIN_SECRET은 충분히 긴 무작위 비밀로 생성하고 Git에 절대 넣지 않는다.

~~~sh
npx wrangler@latest d1 execute pchonlinestudy-premium --remote --file=cloudflare/schema.sql
npx wrangler@latest secret put ADMIN_SECRET --config cloudflare/wrangler.toml
npx wrangler@latest deploy --config cloudflare/wrangler.toml
~~~

## 비공개 교재 업로드
예: R2 key = book/3f81c1c4298504cd/2-1-1.json.
Bash에서 아래를 실행하며, 업로드 후 R2 public access가 **꺼져 있는지** 확인한다.

~~~sh
for file in public/book/3f81c1c4298504cd/[23]-*.json; do
  npx wrangler@latest r2 object put \
    "pchonlinestudy-premium-book/book/3f81c1c4298504cd/$(basename "$file")" \
    --file="$file" --remote
done
~~~

## 관리자 코드 발급
관리자는 API 주소와 ADMIN_SECRET을 직접 지정한다. 코드는 단 한 번 반환되므로 발급 대장에 안전하게 기록한다.

~~~sh
export API="https://YOUR-WORKER.workers.dev"
export ADMIN_SECRET="CLOUDFLARE_SECRET"
curl --fail-with-body -X POST "$API/admin/codes" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"count":10}'
~~~

한 호출당 1~100개 발급. 300명 대상이라면 반복 호출한다. 코드마다 암호학적 난수 128비트(32자리 16진수)를 사용하고 DB에는 SHA-256 해시만 저장한다. 등록은 D1 batch 트랜잭션으로 최초 회원에게만 허용한다.

## 사용자 앱 연결
프런트 빌드:

~~~sh
VITE_PREMIUM_API_URL=https://YOUR-WORKER.workers.dev npm run build
~~~

GitHub Actions로 배포한다면 배포 빌드에 동일 환경변수를 전달해야 한다. Cloudflare의 **ALLOWED_ORIGIN**은 실제 사이트 Origin으로 설정한다. 현재 값은 https://wkddnr0360-blip.github.io 이며 해시 경로를 포함하면 안 된다.

## 출시 전 시험
- 비회원: 1단계 동작, 2·3단계 및 실전 모의고사 잠금.
- 회원가입/로그인 후 코드 등록: 2·3단계와 시험 접근 성공.
- 같은 코드를 다른 회원에게 재등록: 409 거절.
- 비로그인 비공개 파일 GET: 401, 무료 회원 GET: 403.
- 직접 URL **/#/study/3/2/3-2-1/all**로 들어가도 잠김.
- 기존 오답노트/학습기록, 백업/복원, 무료 오프라인 동작 보존.
- 과거 GitHub 공개 경로·캐시·과거 커밋 문제 노출 여부 확인.

## 미완료
실제 Cloudflare 계정 자원 생성/배포, 공개 데이터 비공개 이전, 전용 결제 PG, 계정 복구 기능, 유료 모드 E2E 테스트는 아직 완료되지 않았다. 이를 마무리하기 전 **Draft PR 상태 유지**.
