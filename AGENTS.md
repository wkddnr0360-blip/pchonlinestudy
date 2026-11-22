# 경찰헌법 OX 작업 지침

- 화면과 학습 로직은 TypeScript와 React로 구현한다. 기능 코드는 `src/book`, `src/study`, `src/exam`, `src/review`, `src/storage`에 둔다.
- 교재 문구, 출처, 표, 정오와 해설을 수정하지 않는다. 데이터 변경은 원본 HWPX를 읽는 `scripts/import_book.py`를 통해 재생성한다. 첨부 원본과 참고용 기출 PDF, 원본 사진은 Git에 추가하지 않는다.
- 모의고사는 교재 지문을 그대로 참조하고, 출제 조건을 충족하는 조합을 만든다. 사용자의 진도와 답안은 기기의 IndexedDB에 저장한다.
- 변경 전에 `docs/DEVLOG.md`에서 현재 결정을 확인한다. 작업 후 같은 파일에 변경 내용과 검증 결과를 남긴다. 200줄을 넘으면 상세 기록을 `docs/archive/`의 날짜별 파일로 옮기고, 최근 결정과 미해결 항목을 앞에 요약한다.
- 배포 전 `npm run verify:book`, `npm test`, `npm run build`, `npm run test:e2e`를 실행한다.
