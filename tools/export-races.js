/* 위젯(웹·안드로이드·아이폰)이 받는 일정 races.json 을 앱의 RACES 에서 다시 만듭니다.
 *
 * 왜 필요한가 — 위젯은 앱 전체(365KB) 대신 일정 한 장만 받습니다. 그런데 이 파일을
 * 손으로 만들었더니 앱 일정을 고쳐도 위젯에는 옛 일정이 남았습니다(2026-10, WEC 가
 * 카타르·바레인에서 바르셀로나·몬차로 바뀐 것).
 *
 * 앱 일정을 고친 뒤에는 이걸 다시 돌립니다.
 *   node tools/export-races.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const start = html.indexOf('const RACES = [');
const end = html.indexOf('\n];', start);
if (start < 0 || end < 0) throw new Error('RACES 를 못 찾았습니다');
const RACES = new Function(html.slice(start, end + 3).replace('const RACES =', 'return'))();

const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'races.json'), 'utf8'));
const races = RACES
  .map(r => Object.assign({ s: r.s, r: r.r, n: r.n[0], c: r.c[0], f: r.f, t: r.t, h: r.h }, r.tbd ? { tbd: 1 } : {}))
  .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
fs.writeFileSync(path.join(ROOT, 'races.json'), JSON.stringify({ at: Date.now(), series: old.series, races }));
console.log('경기 ' + races.length + '개 → races.json');
