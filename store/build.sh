#!/usr/bin/env bash
# APK 만들기 — 물어보는 것 없이 한 번에 돌도록 답을 미리 넣어 둡니다.
set -u
cd "$(dirname "$0")"

LOG=build.log
: > "$LOG"
say(){ echo "$@" | tee -a "$LOG"; }

say "== 1. JDK / 안드로이드 SDK 준비 =="
# bubblewrap 은 처음 돌 때 JDK 와 SDK 를 받을지 물어봅니다. yes 를 계속 넣어 줍니다.
# 서명 키 비밀번호도 여기서 정합니다 (아래 PASS).
PASS="apex-apex-2026"

# 이미 받아 둔 게 있으면 건너뜁니다
if [ ! -d "$HOME/.bubblewrap/jdk" ] || [ ! -d "$HOME/.bubblewrap/android_sdk" ]; then
  say "   내려받는 중 (수백 MB, 몇 분 걸립니다)"
fi

say "== 2. 앱 뼈대 만들기 =="
# --manifest 로 웹 매니페스트를 읽고, 나머지는 기본값(엔터)으로 둡니다.
# 서명 키가 없으면 새로 만들며, 그때 필요한 값들을 순서대로 넣습니다.
{
  yes ''                       # 대부분의 질문은 기본값 그대로
} | bubblewrap init \
      --manifest https://apex-five-theta.vercel.app/manifest.json \
      --directory . >> "$LOG" 2>&1
say "   init 끝 (코드 $?)"

say "== 3. 빌드 =="
{
  echo "$PASS"
  echo "$PASS"
} | bubblewrap build --skipPwaValidation >> "$LOG" 2>&1
say "   build 끝 (코드 $?)"

say "== 4. 결과 =="
ls -la *.apk *.aab 2>/dev/null | tee -a "$LOG" || say "   만들어진 파일 없음"
