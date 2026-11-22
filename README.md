# 박철한 온스

박철한 경찰헌법 OX 교재의 3,129문항을 세 단계와 교재 목차에 맞춰 학습하는 설치형 웹앱입니다. 모의고사는 교재 지문을 그대로 사용하며, 학습 기록은 브라우저에 저장합니다.

설정에서 터치 효과음과 진동을 각각 바꿀 수 있고, 재미 모드의 정답 소리는 세 종류 중에서 고를 수 있습니다. 자동 백업은 앱을 쓰는 동안 최근 기록을 기기에 저장합니다. 브라우저에서 폴더 선택을 지원하면 지정한 폴더에 JSON 파일을 저장할 수 있습니다.

## 로컬 실행

Node.js 22.12 이상과 Python 3.10 이상이 필요합니다.

```sh
npm ci
npm run dev
```

## 교재 데이터

`public/book/manifest.json`은 목차입니다. 장별 JSON은 문항 원문, 교재 번호, 출처, 정오와 해설을 담습니다. 학습용 교재와 관련 이미지의 권리는 각 권리자에게 있습니다.

```sh
python3 scripts/import_book.py /path/to/original.hwpx
python3 scripts/verify_book.py --source /path/to/original.hwpx
```

## 검증과 배포

```sh
npm run verify:book
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

GitHub 저장소의 **Settings → Pages → Build and deployment**에서 소스를 **GitHub Actions**로 설정하면 `main`의 검증된 빌드가 배포됩니다. 프로젝트 사이트 경로는 워크플로가 저장소 이름에서 생성합니다.

구현과 검증 이력은 [개발 기록](docs/DEVLOG.md)에 있습니다.
