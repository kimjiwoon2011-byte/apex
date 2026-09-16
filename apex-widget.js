/* APEX — 아이폰 홈 화면 위젯
 *
 * 아이폰은 웹페이지를 위젯으로 못 올립니다. 대신 Scriptable 이라는 무료 앱이
 * 자바스크립트로 진짜 위젯을 그려 줍니다. 이 파일을 거기에 넣으면 됩니다.
 *
 * 넣는 법
 *   1. App Store 에서 Scriptable 설치 (무료)
 *   2. 앱을 열고 오른쪽 위 + 를 눌러 새 스크립트 만들기
 *   3. 이 파일 내용을 전부 붙여넣기
 *   4. 이름을 APEX 로 바꾸기 (왼쪽 아래 설정 → Name)
 *   5. 홈 화면 빈 곳 길게 누르기 → + → Scriptable → 원하는 크기
 *   6. 그 위젯을 길게 눌러 Edit Widget → Script 에서 APEX 고르기
 *      → When Interacting 은 Run Script 말고 Open URL 로 두면 눌렀을 때 앱이 열립니다
 *
 * 일정은 races.json 한 장(12KB)만 받습니다. 못 받으면 마지막으로 받아 둔 것을 씁니다.
 */

const APP  = 'https://apex-five-theta.vercel.app/';
const SRC  = 'https://apex-five-theta.vercel.app/races.json';
const CACHE = FileManager.local().joinPath(
  FileManager.local().cacheDirectory(), 'apex-races.json');

/* ── 일정 받아오기 ── */
async function getData() {
  try {
    const r = new Request(SRC);
    r.timeoutInterval = 10;
    const j = await r.loadJSON();
    if (j && j.races && j.races.length) {
      try { FileManager.local().writeString(CACHE, JSON.stringify(j)); } catch (e) {}
      return j;
    }
  } catch (e) { /* 아래에서 저장해 둔 걸 씁니다 */ }
  try {
    const fm = FileManager.local();
    if (fm.fileExists(CACHE)) return JSON.parse(fm.readString(CACHE));
  } catch (e) {}
  return null;
}

function nextRace(d) {
  const now = Date.now();
  for (const r of d.races) {
    const ms = new Date(r.t).getTime();
    if (ms + (r.h || 2) * 3600000 > now) return r;   /* 진행 중이면 그것 */
  }
  return null;
}

const z = n => (n < 10 ? '0' : '') + n;

/* ── 위젯 그리기 ── */
async function build() {
  const w = new ListWidget();
  w.url = APP;                       /* 눌렀을 때 앱이 열립니다 */
  w.setPadding(14, 15, 14, 15);

  const data = await getData();
  if (!data) {
    w.backgroundColor = new Color('#0b1424');
    const t = w.addText('일정을 받지 못했어요');
    t.font = Font.semiboldSystemFont(13);
    t.textColor = Color.white();
    return w;
  }

  const r = nextRace(data);
  if (!r) {
    w.backgroundColor = new Color('#0b1424');
    const t = w.addText('이번 시즌 경기가 끝났어요');
    t.font = Font.semiboldSystemFont(13);
    t.textColor = Color.white();
    return w;
  }

  const s = data.series[r.s] || { name: r.s, color: '#2b3a55' };
  const g = new LinearGradient();
  g.colors = [new Color(s.color), new Color('#060a14')];
  g.locations = [0, 0.78];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(0.35, 1);
  w.backgroundGradient = g;

  /* 윗줄 — 부문 · 라운드 */
  const top = w.addStack();
  top.centerAlignContent();
  const tag = top.addStack();
  tag.backgroundColor = new Color('#ffffff', 0.22);
  tag.cornerRadius = 7;
  tag.setPadding(2, 7, 2, 7);
  const tagT = tag.addText(s.name);
  tagT.font = Font.heavySystemFont(10);
  tagT.textColor = Color.white();
  top.addSpacer(6);
  const rd = top.addText('라운드 ' + r.r);
  rd.font = Font.semiboldSystemFont(10);
  rd.textColor = new Color('#ffffff', 0.72);
  top.addSpacer();

  w.addSpacer(5);

  /* 제목 + 서킷을 한 줄에 */
  const line = w.addStack();
  line.bottomAlignContent();
  const nm = line.addText((r.f ? r.f + ' ' : '') + r.n);
  nm.font = Font.heavySystemFont(18);
  nm.textColor = Color.white();
  nm.lineLimit = 1;
  nm.minimumScaleFactor = 0.7;
  if (r.c) {
    line.addSpacer(6);
    const ci = line.addText(r.c);
    ci.font = Font.semiboldSystemFont(10);
    ci.textColor = new Color('#ffffff', 0.6);
    ci.lineLimit = 1;
    ci.minimumScaleFactor = 0.8;
  }
  line.addSpacer();

  w.addSpacer(9);

  /* 카운트다운 */
  const ms = new Date(r.t).getTime();
  const d = ms - Date.now();
  if (d <= 0) {
    const live = w.addText('● 진행 중');
    live.font = Font.heavySystemFont(15);
    live.textColor = new Color('#ff5b5b');
  } else {
    const cd = w.addStack();
    cd.spacing = 5;
    const cell = (v, label) => {
      const b = cd.addStack();
      b.layoutVertically();
      b.centerAlignContent();
      b.backgroundColor = new Color('#ffffff', 0.14);
      b.cornerRadius = 9;
      b.setPadding(6, 4, 5, 4);
      const n = b.addText(String(v));
      n.font = Font.heavySystemFont(17);
      n.textColor = Color.white();
      n.centerAlignText();
      const l = b.addText(label);
      l.font = Font.semiboldSystemFont(8);
      l.textColor = new Color('#ffffff', 0.6);
      l.centerAlignText();
    };
    cell(Math.floor(d / 86400000), '일');
    cell(z(Math.floor(d % 86400000 / 3600000)), '시간');
    cell(z(Math.floor(d % 3600000 / 60000)), '분');
    cd.addSpacer();
  }

  /* 위젯은 스스로 다시 그리지 않습니다. 15분 뒤 갱신을 요청해 둡니다 */
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();     /* 앱 안에서 열면 미리보기 */
Script.complete();
