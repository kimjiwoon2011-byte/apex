# 구글 플레이 제출 준비물

APEX 를 안드로이드 앱으로 만들어 플레이 스토어에 올리기 위한 자료입니다.
계정이 없어도 여기까지는 준비해 둘 수 있습니다.

---

## 먼저 알아야 할 것

| 항목 | 내용 |
|---|---|
| 개발자 계정 | **만 18세 이상만 가입** — 보호자 명의가 필요합니다 |
| 등록비 | **$25** (한 번만) |
| 본인 확인 | 정부 발급 신분증 + 전화번호 인증 |
| 정식 출시 조건 | 개인 계정은 **테스터 12명이 14일간** 비공개 테스트 |

애플(App Store)은 연 $99 이고, 웹앱을 감싼 앱은 가이드라인 4.2 로 반려될
가능성이 높습니다. 안드로이드부터 하는 편이 낫습니다.

---

## 1. 앱 파일(AAB) 만들기

웹앱을 안드로이드 앱으로 감싸는 구글 공식 방법이 **TWA**(Trusted Web
Activity)입니다. Bubblewrap 이라는 공식 도구를 씁니다.

```bash
# 준비물: Node.js, Java 17
npm install -g @bubblewrap/cli

# 이 폴더에서 실행
cd store
bubblewrap init --manifest https://apex-five-theta.vercel.app/manifest.json

# 위 명령이 묻는 값은 twa-manifest.json 에 이미 적어 두었습니다.
# 물어보면 그대로 두고 엔터를 누르면 됩니다.

bubblewrap build
```

끝나면 `app-release-bundle.aab` 가 생깁니다. 이 파일을 플레이 콘솔에 올립니다.

> `android.keystore` 파일과 비밀번호는 **절대 잃어버리면 안 됩니다.**
> 이걸 잃으면 앱을 업데이트할 수 없습니다. 안전한 곳에 따로 보관하세요.
> 저장소에 올리지 마세요 (`.gitignore` 에 넣어 두었습니다).

## 2. 주소창 없애기 (필수)

TWA 는 이 앱이 정말 내 것인지 확인해야 주소창을 숨깁니다. 확인용 파일을
사이트에 올려야 합니다.

```bash
# 빌드 후 나오는 지문(SHA-256)을 확인
bubblewrap fingerprint list
```

나온 지문을 `assetlinks.json` 의 `XX:XX:...` 자리에 넣고, 그 파일을
`/.well-known/assetlinks.json` 으로 배포하면 됩니다.
(`assetlinks.template.json` 을 준비해 두었습니다.)

확인 방법: `https://apex-five-theta.vercel.app/.well-known/assetlinks.json`
이 열리면 됩니다.

## 3. 플레이 콘솔에 넣을 내용

- `listing-ko.md` — 스토어 소개글 (한국어)
- `data-safety.md` — 데이터 보안 설문 답변
- 개인정보처리방침 주소: `https://apex-five-theta.vercel.app/privacy`
- 스크린샷: `screenshots/` 폴더

## 4. 콘텐츠 등급

설문에서 이렇게 답하면 됩니다.

| 질문 | 답 |
|---|---|
| 폭력·성적 내용·욕설·약물 | 모두 **없음** |
| 사용자 간 소통 기능 | **있음** (단톡방·댓글) |
| 위치 공유 | 없음 |
| 디지털 콘텐츠 구매 | 없음 |

사용자 간 소통이 있으므로 등급이 조금 올라갑니다. 정직하게 답해야 합니다 —
숨기면 나중에 앱이 내려갑니다.
