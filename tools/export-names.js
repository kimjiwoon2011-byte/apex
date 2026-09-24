/* 앱의 이름표를 서버가 쓸 수 있게 파일로 뽑습니다.
 *
 * 왜 필요한가 — 이름표는 index.html 안에서 만들어집니다. 서버(자동 갱신,
 * 카드 만들기)는 그걸 볼 수 없어서 모델에게 빈 목록을 보내 왔습니다.
 * 그러자 모델이 이름을 제멋대로 한글로 옮겼습니다 (Sachsenring → 작링).
 * 앱은 영어 이름만 고칠 수 있어서, 이미 한글이 된 오역은 못 고칩니다.
 *
 * 손으로 옮겨 적으면 앱과 서버가 어긋납니다. 그래서 앱 코드를 그대로
 * 돌려 NAME_MAP 을 만들고, 그 결과를 저장합니다. 매칭 방식(정규식)까지
 * 똑같이 가져갑니다.
 *
 * 이름표를 고친 뒤에는 이걸 다시 돌려야 합니다.
 *   node tools/export-names.js     (api/_names.js 를 새로 씁니다)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];

/* NAME_MAP 을 만드는 데까지만 잘라 돌립니다. 그 뒤는 화면을 그리는
   코드라 여기서 돌릴 필요도 없고 돌릴 수도 없습니다. */
const endMark = src.indexOf('const NAME_MAP = (()=>{');
if (endMark < 0) throw new Error('NAME_MAP 을 못 찾았습니다');
const close = src.indexOf('})();', endMark);
const part = src.slice(0, close + 5) +
  '\n;globalThis.__PAIRS = NAME_MAP.map(([re, ko]) => [re.source, ko]);';

/* 앞부분이 건드리는 브라우저 것들을 흉내만 냅니다 */
const store = {};
const dummyEl = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : dummyEl),
  apply: () => dummyEl,
  set: () => true,
});
const ctx = {
  console,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  navigator: { language: 'ko-KR', userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
  location: { protocol: 'https:', host: 'apex-five-theta.vercel.app', origin: '', pathname: '/', search: '', hash: '' },
  document: dummyEl,
  window: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  requestAnimationFrame: f => 0, cancelAnimationFrame() {},
  scrollY: 0, scrollX: 0, innerWidth: 400, innerHeight: 800, devicePixelRatio: 2,
  history: { replaceState() {}, pushState() {} },
  screen: { width: 400, height: 800 },
  performance: { now: () => Date.now() },
  fetch: async () => ({ ok: false, json: async () => ({}), text: async () => '' }),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  TextDecoder, TextEncoder, Uint8Array, URL, URLSearchParams, AbortController,
  Promise, Error, TypeError, Symbol, Proxy, Reflect, WeakMap,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, escape, unescape,
  Notification: { permission: 'default' },
  Intl, Date, Math, JSON, RegExp, Object, Array, String, Number, Set, Map,
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(part, ctx, { filename: 'index.html' });

const pairs = ctx.__PAIRS;
if (!Array.isArray(pairs) || pairs.length < 100) throw new Error('이름이 너무 적습니다: ' + (pairs && pairs.length));

/* .json 을 파일로 읽으면 Vercel 에서 죽습니다. 서버 파일을 CommonJS 로 바꿔
   돌리는데 import.meta 는 그 방식에서 문법 오류입니다. 이미 잘 도는
   import { ... } from './_lib.js' 와 같은 모양으로 불러오게 .js 로 씁니다. */
const out = path.join(ROOT, 'api', '_names.js');
fs.writeFileSync(out,
  '/* tools/export-names.js 가 만든 파일입니다. 손으로 고치지 마세요. */\n' +
  'export const NAME_PAIRS = ' + JSON.stringify(pairs) + ';\n');
console.log('이름 ' + pairs.length + '개 → api/_names.js');
