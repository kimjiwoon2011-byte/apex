# APEX — 모터스포츠 통합 알림

F1 · WEC · IMSA · DTM · SUPER GT · GT 월드 챌린지 일정과 소식을 한곳에서 보는 웹앱.

- `index.html` — 앱 전체 (HTML · CSS · JS 한 파일)
- `sw.js` · `manifest.json` — 홈 화면에 설치하고 통신이 약할 때도 열리게 하는 부분
- `api/` — Vercel 서버 함수. 카드뉴스·자세한 풀이를 무료 AI(OpenRouter)로 만들고, 하루 두 번 자동 갱신(`cron.js`)
- `vercel.json` — 뉴스 RSS·번역을 서버에서 대신 받아오는 경로(브라우저 CORS 우회)와 자동 갱신 시각
- `widget.html` · `apex-widget.js` · `ios.html` — 홈 화면 위젯(웹 위젯 앱용 · 아이폰 Scriptable용)
- `android/` — 안드로이드 홈 화면 위젯 앱. GitHub Actions 가 빌드해 `releases/download/widget/apex-widget.apk` 에 올립니다
- `tools/export-names.js` — 앱의 이름표를 서버(`api/_names.js`)로 옮기는 도구

## 기능

- **마이홈** — 관심 시리즈·응원팀·응원선수를 고르면 팀 색과 실제 레이스카 사진으로 꾸며진 홈
- **소식** — 시리즈별 뉴스, AI 카드뉴스와 누르면 나오는 자세한 설명문
- **일정** — 캘린더, 실시간 카운트다운, 서킷 지도, 경기 후 별점·리뷰
- **단톡방** — 구글 로그인 후 쓰는 실시간 채팅(사진 포함)
- **알림** — 다음 경기 카운트다운, 배경화면용 캘린더, 홈 화면 위젯

한국어 · English · 日本語 지원, 라이트/다크 모드.

## 배포

빌드 과정이 없습니다. GitHub 에 push 하면 Vercel 이 자동 배포합니다.
서버 함수에는 Vercel 환경변수 `OPENROUTER_KEY` 가 필요합니다 (저장소에 넣지 않습니다).

## 사진 출처

차량 사진은 위키미디어 커먼즈의 자유 이용 저작물입니다. 각 사진의 촬영자와 라이선스는 앱 화면 안에 표시됩니다.
