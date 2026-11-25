# 경찰헌법 OX 작업 지침

- 화면과 학습 로직은 TypeScript와 React로 구현한다. 기능 코드는 `src/book`, `src/study`, `src/exam`, `src/review`, `src/storage`에 둔다.
- 교재 문구, 출처, 표, 정오와 해설을 수정하지 않는다. 데이터 변경은 원본 HWPX를 읽는 `scripts/import_book.py`를 통해 재생성한다. 첨부 원본과 참고용 기출 PDF, 원본 사진은 Git에 추가하지 않는다.
- 모의고사는 교재 지문을 그대로 참조하고, 출제 조건을 충족하는 조합을 만든다. 사용자의 진도와 답안은 기기의 IndexedDB에 저장한다.
- 변경 전에 `docs/DEVLOG.md`에서 현재 결정을 확인한다. 작업 후 같은 파일에 변경 내용과 검증 결과를 남긴다. 200줄을 넘으면 상세 기록을 `docs/archive/`의 날짜별 파일로 옮기고, 최근 결정과 미해결 항목을 앞에 요약한다.
- 배포 전 `npm run verify:book`, `npm test`, `npm run build`, `npm run test:e2e`를 실행한다.

## 온스 2.0 작업 브랜치 추가 지침

- `docs/CODEX-START.md`, `docs/ONS2-CODEX-MASTERPLAN.md`, `docs/TOWER-ART-DIRECTION.md`, DEVLOG를 우선 읽고 최신 확정 요구를 적용한다.
- 교재 원본은 불변. 수정은 공식 근거·미리보기·명시적 승인·revision 충돌 검증·감사 이력이 있는 서버 overlay로만 반영한다. 기존 기록은 사용자 선택으로 안전하게 이관하고 인증 필요 원문/해설은 정적 배포·브라우저 영구 저장·백업에 금지.
- 무료 일반모드는 1단계 100%, Bronze/Silver까지만. 인증 일반모드는 1/2단계, Gold 가능. 도전모드는 인증+Gold 이상, 2/3단계 50:50. 경쟁 순위 및 명예의 전당은 인증 회원만; 서버 권한 검증 필수.
- 무한의 탑 아트와 모션은 무조건 실제 2D 픽셀 스프라이트 프레임 방식. 기존 철한쌤 정체성 유지, 3D/일반 일러스트 대체 금지.
- 운영 main/DNS/DB/Secrets는 사용자 승인 없이 변경 금지. 합성 데이터·스테이징 검증 우선. 실행하지 않은 테스트나 배포를 완료로 기록하지 않는다.
