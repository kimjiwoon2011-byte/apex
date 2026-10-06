/* 카드 만들기 공통 부분. api/cards.js (앱이 부름) 와 api/cron.js (정해진
 * 시각에 저절로 도는 것) 가 같이 씁니다. 파일 이름이 _ 로 시작하면
 * Vercel 이 주소로 열어 주지 않습니다. */

import { NAME_PAIRS } from './_names.js';

/* ── 이름표 ──
   앱이 쓰는 것과 똑같은 표입니다 (tools/export-names.js 가 index.html 에서
   뽑아 냅니다). 지금까지 서버는 모델에게 빈 목록을 보냈고, 모델은 이름을
   제멋대로 한글로 옮겼습니다 — Sachsenring 이 어떤 카드에선 작센링,
   어떤 카드에선 작링. 앱은 영어 이름만 고칠 수 있어서 이미 한글이 된
   오역은 손댈 수가 없었습니다.
   이제 모델에게 표를 보내고, 받은 글에도 한 번 더 입힙니다. */
const NAME_RE = NAME_PAIRS.map(([src, ko]) => [new RegExp(src, 'g'), ko]);

/* 이름을 한글로 바꾼 뒤 조사를 받침에 맞춥니다.
   모델이 영어 이름 뒤에 조사를 붙인 것(Heinrich은)을 이름만 바꾸면
   '하인리히은' · '앙들라우어과'가 됐습니다. 표기표에 있는 한글 이름 바로 뒤의
   조사만 고칩니다 — 이름 앞뒤가 다른 한글로 이어지면 건드리지 않습니다. */
const JOSA = { 은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'],
               을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'] };
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* 배운 이름(아래 loadLearned)이 붙으면 다시 만듭니다 */
let KO_NAME_RE;
function buildKoNameRe() {
  KO_NAME_RE = new RegExp('(?<![가-힣])(' +
    [...new Set(NAME_RE.map(p => p[1]))].sort((a, b) => b.length - a.length).map(escRe).join('|') +
    ')(으로|은|는|이|가|을|를|과|와|로)(?![가-힣])', 'g');
}
buildKoNameRe();
export function fixJosa(str) {
  return String(str || '').replace(KO_NAME_RE, (all, name, p) => {
    const c = name.charCodeAt(name.length - 1) - 0xAC00;
    if (c < 0 || c > 11171) return all;                  /* 한글로 끝나지 않는 이름 */
    const jong = c % 28, has = jong !== 0;
    if (p === '으로' || p === '로') return name + (has && jong !== 8 ? '으로' : '로');
    return name + JOSA[p][has ? 0 : 1];
  });
}

/* 깨진 글자 — 러시아·그리스 문자, 밑줄, 낱자모, 깨진 문자표, 한글 바로 뒤에
   붙은 영어 소문자. 실제로 '아лекс 퀸', '2027 시_season' 이 카드로 저장됐습니다.
   이런 결과는 받지 않고, 다음 모델이나 다음 갱신에 다시 만듭니다. */
const GARBLED = /[\u0370-\u03FF\u0400-\u04FF\u3131-\u318E\uFFFD_]|[가-힣][a-z]/;
export const garbled = s => GARBLED.test(String(s || ''));

/* 글에 나오는 이름만 골라 "영어 = 한글" 줄로 만듭니다 (앱의 nameGlossary 와 같음) */
export function nameGlossary(lines, max = 40) {
  const hay = lines.filter(Boolean).join(' ');
  const seen = new Set(), out = [];
  for (const [re, ko] of NAME_RE) {
    re.lastIndex = 0;
    const m = re.exec(hay);
    if (!m || seen.has(ko)) continue;
    seen.add(ko);
    out.push(m[0] + ' = ' + ko);
    if (out.length >= max) break;
  }
  return out;
}

/* 모델이 영어로 남긴 이름을 표대로 바꿉니다 (앱의 postNames 와 같음) */
export function applyNames(str) {
  let out = String(str || '');
  for (const [re, ko] of NAME_RE) { re.lastIndex = 0; out = out.replace(re, ko); }
  return fixJosa(out);
}

export const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
/* 순서는 같은 기사 5건으로 직접 재서 정했습니다 (2026-10-02, F1·WEC 두 번).
     ling-flash-sante  10.2초 5/5 (두 번째는 24초 시간초과) — 번역이 자연스러움
     gemma-4 ×2 · qwen3.8   두 번 다 다른 사용자가 몰려 거절(429), 1초 안에 돌아옴
     dots-3-note       13.8초 1/5, 글자가 깨짐("바 spoilers") — 맨 뒤 가까이
     nemotron-3.5 lightning·super 시간초과, inkling-small 403 — 넣지 않음
   429 는 1초 안에 돌아오므로 여럿 줄 세워 두는 게 이득입니다.
   9월 말에 ling-3.0-flash-fin · nex-n2.5-mini 가 목록에서 사라졌습니다 —
   사라진 모델은 liveModels() 가 알아서 건너뜁니다. */
export const OR_MODELS = [
  'inclusionai/ling-3.0-flash-sante:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-26b-a4b-it:free',
];
/* dots-3-note 는 뺐습니다. 10/2 검수에서 깨진 카드 대부분이 이 모델 것이었습니다
   ('아лекс', '시_season', '광대 레이스', '모듈 쁘띠'). 틀린 카드를 보여 주느니
   6시간 뒤 갱신에서 다시 만드는 게 낫습니다. nemotron-ultra 는 늘 시간초과였습니다. */

/* 지금 쓸 수 있는 것만 남깁니다.

   무료 모델은 예고 없이 사라집니다. 2026-09 말에 1·2순위가 목록에서 빠져
   404 만 돌려줬는데, 서버는 매번 그 둘부터 부르느라 시간과 호출을 버렸고
   자동 갱신이 일주일 동안 카드를 거의 못 만들었습니다.
   모델 목록은 열쇠 없이 받을 수 있습니다. 한 시간 동안 기억해 둡니다. */
let liveCache = { at: 0, ids: null };
export async function liveModels() {
  if (liveCache.ids && Date.now() - liveCache.at < 3600000) return liveCache.ids;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models', { signal: ac.signal });
    const have = new Set(((await r.json()).data || []).map(m => m.id));
    const ids = OR_MODELS.filter(m => have.has(m));
    if (ids.length) { liveCache = { at: Date.now(), ids }; return ids; }
  } catch (e) { /* 목록을 못 받으면 아래처럼 다 시도합니다 */ }
  finally { clearTimeout(timer); }
  return OR_MODELS;
}

/* 다른 엔진으로 부르기 — 내 PC 의 Ollama 처럼 OpenAI 와 같은 형식을 쓰는 곳.
   서버(Vercel)에서는 켜지 않습니다. tools/local-fill.mjs 가 켭니다.
   켜져 있으면 OpenRouter 하루 한도를 세지도, 아끼지도 않습니다 — 내 PC 는 한도가 없습니다. */
/* body: 그 엔진에만 더 보낼 값. Ollama 의 gemma4 는 답 전에 '생각'부터 길게 써서
   글자 한도를 다 먹고 답 칸이 비었습니다 — reasoning_effort: 'none' 으로 끕니다. */
let ENGINE = null;
export function useEngine(e) { ENGINE = e; }
const engineUrl = () => (ENGINE ? ENGINE.url : OR_URL);
const engineHeaders = key => Object.assign({ 'Content-Type': 'application/json' },
  ENGINE ? {} : { Authorization: 'Bearer ' + key });

const OR_SEP = ' ::: ';

/* 앱 안의 프롬프트와 같은 것입니다. 서버가 프롬프트를 쥐고 있어야
   이 주소가 남의 OpenRouter 대리 호출기로 쓰이지 않습니다. */
export const OR_SYS = [
  '너는 한국 모터스포츠 카드뉴스를 만드는 기자다.',
  '영어 기사를 받아, 지나가며 봐도 무슨 일인지 알아보게 세 줄로 만든다.',
  '',
  '── 형식 ── 길이는 단어 수로 센다. 띄어쓴 덩어리 하나가 한 단어다.',
  '훅   3~4단어  왜 지금 중요한지 짧은 배경. 원문에 없으면 빈칸으로 둔다',
  '핵심 2~4단어  무슨 일인지 한 방에. 반드시 명사로 끝낸다',
  '설명 6~8단어  누가 무엇을 했는지 사실 한 줄',
  '',
  '── 보기 ──',
  '입력 [1] Madrid F1 track hit by cable theft two weeks before race ::: Spanish police confirmed a large theft of generator cables.',
  '출력 [1] 개최 2주 남았는데 ::: 마드링 절도사건 ::: 스페인 경찰, 발전기 케이블 대량 도난 인정',
  '',
  '입력 [2] Leclerc explains vision issue after Monza crash ::: Ferrari driver Charles Leclerc said his vision issue was very short. He lost control on lap 2.',
  '출력 [2] 몬차 충돌 그 후 ::: 르클레르 시력 이상 ::: 2랩 조종 잃고 배리어 충돌, "아주 잠깐이었다"',
  '',
  '입력 [3] Porsche Penske leadership speaks out on IMSA performance ::: Management expressed strong frustration over disappointing results.',
  '출력 [3] 시즌 성적 부진에 ::: 포르쉐 수뇌부 작심 발언 ::: 펜스케 경영진, 올 시즌 결과에 강한 불만',
  '',
  '보기 문구를 그대로 쓰지 마라. 보기의 단어 수만 따라라.',
  '',
  '── 규칙 ──',
  '- 원문에 없는 내용을 지어내지 마라. 숫자·순위·날짜를 만들지 마라.',
  '- 배경이 원문에 없으면 훅을 빈칸으로 둔다.',
  '- 사람·팀·서킷 이름은 표기표가 있으면 표기표대로 쓴다.',
  '- 표기표에 없는 이름은 한글로 옮기지 말고 영어 그대로 둔다. 네가 소리 나는',
  '  대로 적으면 같은 사람이 카드마다 다른 이름이 된다.',
  '  (Isack Hadjar 를 이자크 하다르 라고 쓰지 마라. Isack Hadjar 로 둬라.)',
  '- 이름이 아닌 보통 낱말은 반드시 우리말로 옮긴다.',
  '- 기사가 독일어·일본어여도 우리말로 쓴다. 일본 사람·팀 이름(한자·가타카나)은',
  '  한국에서 쓰는 소리대로 성 이름 순으로 쓴다(坪井翔 → 쓰보이 쇼).',
  '  독일어 기사의 이름은 표기표에 없으면 원래 철자 그대로 둔다.',
  '- 원문의 강도를 바꾸지 마라. considers·plans·eyes 는 검토·추진, rumoured 는 설,',
  '  could·may 는 가능성이다. 정해지지 않은 일을 도입·확정이라고 쓰지 마라.',
  '- 자주 틀리는 말: shootout=슛아웃, wet=젖은 노면, lost his temper=격분,',
  '  team principal=팀 대표, stewards=심판진, title=챔피언십 타이틀,',
  '  medium(타이어)=미디엄, racing incident=레이싱 인시던트, Am class=Am 클래스,',
  '  wide-open=혼전, derailed=무산, restart=리스타트, podium=포디엄, organisers=주최 측.',
  '- 존댓말·마침표·한자·느낌표 금지.',
  '',
  '── 출력 ──  [번호] 훅 ::: 핵심 ::: 설명',
  '번호 하나당 한 줄. 합치거나 빠뜨리지 마라. 생각 과정을 쓰지 마라.',
].join('\n');

/* 번호가 몇 개 빠져도 받은 것만 씁니다 */
function orParse(text, n) {
  const out = new Array(n).fill(null);
  const re = /\[(\d+)\]\s*([\s\S]*?)(?=\n?\[\d+\]|$)/g;
  let m, got = 0;
  while ((m = re.exec(String(text || '')))) {
    const i = +m[1] - 1, v = m[2].replace(/\s+/g, ' ').trim();
    if (i >= 0 && i < n && v && !out[i]) { out[i] = v; got++; }
  }
  return got >= Math.ceil(n * 0.6) ? out : null;
}

/* 형식을 어긴 카드는 버립니다 (앱의 cardOk 와 같은 기준) */
function cardOk(c) {
  if (!c || !c.p) return false;
  if (garbled(c.h + ' ' + c.p + ' ' + c.d)) return false;
  const bad = s => /[.!]$/.test(s) || /[一-鿿]/.test(s) || /(습니다|입니다|합니다)$/.test(s);
  if (c.p.length > 20 || bad(c.p)) return false;
  if (c.h && (c.h.length > 22 || bad(c.h))) return false;
  if (c.d && (c.d.length > 60 || /[一-鿿]/.test(c.d))) return false;
  return true;
}

const cut = s => {
  const t = String(s || '-');
  if (t.length <= 200) return t;
  const p = t.lastIndexOf(' ', 200);
  return t.slice(0, p > 120 ? p : 200);
};

export const keyOf = link => 'ko|' + String(link || '').slice(0, 400).slice(-160);

/* 기사 묶음을 카드로 만듭니다. budgetMs 안에서만 움직입니다. */
export async function makeCards(items, glossary, key, budgetMs) {
  await loadLearned();
  const body = items.map((it, i) => '[' + (i + 1) + '] ' + it.title + OR_SEP + cut(it.lead)).join('\n');
  /* 앱이 보낸 표가 없으면(자동 갱신) 서버가 직접 만듭니다 */
  const gl = (glossary && glossary.length) ? glossary
    : nameGlossary(items.map(it => it.title + ' ' + (it.lead || '')));
  const msg = gl.length
    ? '아래 이름은 반드시 이 표기를 써라:\n' + gl.join('\n') + '\n\n' + body
    : body;

  const deadline = Date.now() + (budgetMs || 50000);
  const why = [];                     /* 모델마다 무엇 때문에 실패했는지 */
  let raw = '';                       /* 규칙을 어겼을 때 뭘 뱉었는지 */
  for (const model of ENGINE ? ENGINE.models : await liveModels()) {
    /* 한 번에 줄 시간을 남은 시간에 맞춰 정합니다. 20초로 못박아 두었더니
       기사가 6건만 돼도 다 못 만들고 잘렸습니다 — F1 에서 모델 둘이 연달아
       20초에 잘려 한 장도 못 건졌습니다. 첫 번째에 넉넉히 주고, 시간이
       남으면 짧게 한 번 더 해 봅니다. 뒤에 저장과 다음 부문 호출이
       남아 있으므로 2초는 떼어 둡니다. */
    const room = deadline - Date.now() - 2000;
    /* 한 모델에 24초까지. 전에는 28초라 첫 모델이 느리면 묶음 시간을 다
       먹어 다음 모델로 못 넘어갔습니다 (WEC·IMSA 가 그래서 통째로 실패). */
    /* 1순위(ling)가 붐빌 때 25초 넘게 걸려 IMSA 가 연달아 시간초과였습니다 */
    const callMs = Math.min(ENGINE ? ENGINE.callMs : 32000, room);
    if (callMs < 12000) break;                  /* 한 번 돌릴 시간이 없으면 중단 */
    if (!ENGINE) await spend('card', model);

    /* 시계는 본문을 다 읽을 때까지 살려 둡니다. 머리글이 오자마자 껐더니,
       답을 천천히 흘려 보내는 모델에서 res.json() 이 하염없이 기다렸고
       함수가 60초에 죽었습니다. */
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), callMs);
    try {
      const res = await fetch(engineUrl(), {
        method: 'POST', signal: ac.signal,
        headers: engineHeaders(key),
        body: JSON.stringify({
          model, temperature: 0.3, max_tokens: 9000, ...(ENGINE ? ENGINE.body : {}),
          messages: [{ role: 'system', content: OR_SYS }, { role: 'user', content: msg }],
        }),
      });
      if (res.status === 429) {
        const e = await res.json().catch(() => ({}));
        const meta = (e && e.error && e.error.metadata) || {};
        const msg = String((e.error || {}).message || '') + ' ' + (meta.limit_source || '');
        if (/per-day|daily/i.test(msg))
          return { cards: null, reason: 'daily-limit', why: why.concat('하루한도') };
        why.push('429 ' + msg.trim().slice(0, 60));
        continue;                                /* 잠깐 몰린 것뿐이니 다음 모델로 */
      }
      if (!res.ok) { why.push('HTTP ' + res.status); continue; }
      const j = await res.json();
      const txt = j && j.choices && j.choices[0] && j.choices[0].message.content;
      const got = orParse(txt, items.length);
      if (!got) { why.push('번호를 못 읽음'); raw = String(txt || '(빈 답)').slice(0, 400); continue; }
      const cards = got.map(s => {
        if (!s) return null;
        const p = s.split(/\s*:{2,}\s*/).map(x => x.trim()).filter(Boolean);
        if (p.length < 2) return null;
        const c = { h: applyNames(p[0] || ''), p: applyNames(p[1] || ''), d: applyNames(p[2] || '') };
        return cardOk(c) ? c : null;
      });
      if (cards.some(Boolean)) return { cards, model };
      why.push('형식 어긋남');
      raw = String(txt || '').slice(0, 400);
    } catch (e) { why.push(/abort/i.test(String(e)) ? '시간초과' : String(e).slice(0, 40)); }
    finally { clearTimeout(timer); }
  }
  return { cards: null, reason: 'all-models-failed', why, raw };
}

/* ── Supabase ── */
export function sbConf() {
  return {
    url: process.env.SUPABASE_URL || 'https://nlwfmhrhbgzvvenztejn.supabase.co',
    headers: {
      apikey: process.env.SUPABASE_KEY || 'sb_publishable_7CfWUlT7GDETfQwp3Ga-tw_Z6cN-up4',
      'Content-Type': 'application/json',
    },
  };
}

/* 이미 서버에 있는 카드를 주소로 찾아옵니다 */
export async function loadExisting(links) {
  const { url, headers } = sbConf();
  const out = {};
  if (!links.length) return out;
  try {
    const ids = links.map(keyOf).map(a => '"' + encodeURIComponent(a).replace(/"/g, '') + '"').join(',');
    const r = await fetch(url + '/rest/v1/cards?id=in.(' + ids + ')&select=*', { headers });
    if (r.ok) (await r.json()).forEach(row => {
      out[row.id] = { h: row.hook || '', p: row.punch || '', d: row.line || '' };
    });
  } catch (e) { /* 없으면 빈손으로 */ }
  return out;
}

/* 만든 카드를 저장합니다 */
export async function saveCards(rows) {
  if (!rows.length) return 0;
  const { url, headers } = sbConf();
  try {
    const r = await fetch(url + '/rest/v1/cards?on_conflict=id', {
      method: 'POST',
      headers: Object.assign({}, headers, { Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify(rows),
    });
    return r.ok ? rows.length : 0;
  } catch (e) { return 0; }
}

/* ── 오늘 몇 번 불렀는지 ──────────────────────────────────────────
   무료 한도는 하루 50회이고 UTC 0시(한국 오전 9시)에 다시 채워집니다.
   카드는 모두가 첫 화면에서 보는 것이라 풀이보다 먼저입니다. 그런데 풀이가
   한도를 먼저 다 써 버리면, 그 뒤에 올라온 기사는 카드를 못 만들어 구글
   번역 제목이 그대로 나옵니다 (2026-09-25 새벽 F1 10장이 전부 그랬습니다).

   부를 때마다 표에 한 줄씩 남기고 오늘 줄 수를 셉니다. 숫자 하나를 고쳐
   쓰는 식으로 세면, 여섯 부문이 동시에 돌 때 서로 덮어써서 적게 셉니다.
   줄을 따로 넣으면 그런 일이 없습니다. 지난 줄은 자동 갱신이 지웁니다. */
export const DEEP_STOP = 35;       /* 이만큼 쓰면 풀이는 멈춥니다 — 15회는 카드 몫 */
const quotaDay = () => new Date().toISOString().slice(0, 10);
const QUOTA = '_q|';

async function spend(kind, model) {
  const { url, headers } = sbConf();
  try {
    await fetch(url + '/rest/v1/cards', {
      method: 'POST', headers,
      body: JSON.stringify([{
        id: QUOTA + quotaDay() + '|' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        hook: kind, punch: '', line: String(model || '').slice(0, 120), at: Date.now(),
      }]),
    });
  } catch (e) { /* 못 세더라도 부르는 것까지 막지는 않습니다 */ }
}

export async function spentToday() {
  const { url, headers } = sbConf();
  try {
    const r = await fetch(url + '/rest/v1/cards?id=like.' +
      encodeURIComponent(QUOTA + quotaDay() + '|') + '*&select=id', { headers });
    if (r.ok) return (await r.json()).length;
  } catch (e) { /* 못 세면 0 — 풀이를 막지 않는 쪽으로 */ }
  return 0;
}

/* 사흘 지난 기록은 지웁니다 */
export async function dropOldSpend() {
  const { url, headers } = sbConf();
  try {
    await fetch(url + '/rest/v1/cards?id=like.' + encodeURIComponent(QUOTA) + '*&at=lt.' +
      (Date.now() - 3 * 86400000), { method: 'DELETE', headers });
  } catch (e) { /* 다음 번에 지웁니다 */ }
}


/* ══════════════════════════════════════════════════════════════
   자세한 풀이 — 카드를 눌렀을 때 나오는 긴 글

   왜 서버인가 — 카드와 같은 이유입니다. 기기에 키가 없으면 아무것도
   안 나왔습니다. 한 번 만든 글은 Supabase 에 쌓여 모두가 나눠 씁니다.

   왜 원문을 읽는가 — RSS 도입부는 200자뿐입니다. 그걸로 길게 쓰라고
   하면 지어내는 수밖에 없습니다. 원문을 읽혀야 길이가 정직해집니다.
   ══════════════════════════════════════════════════════════════ */

export const DEEP_SYS = [
  '너는 모터스포츠를 오래 봐 온 기자다. 아는 것이 많지만, 경기를 처음 보는',
  '사람도 알아듣게 쉬운 말로 쓴다.',
  '',
  '── 형식 ──',
  '[무슨 일] 누가 언제 어디서 무엇을 했는지. 3~5문장.',
  '[왜 중요] 그래서 무엇이 달라지는지. 2~3문장.',
  '[알아둘 것] 배경과 앞일. 2~3문장.',
  '',
  '── 무엇을 쓰는가 — 이게 제일 중요하다 ──',
  '- 구체적인 것을 써라. 이름, 숫자, 순위, 포인트 차, 랩, 날짜, 서킷, 팀 이름.',
  '  원문에 있으면 반드시 넣어라. 그게 이 글의 값어치다.',
  '- 누가 한 말이 원문에 있으면 한 마디만 따옴표로 넣어라. 한 문장을 넘기지 마라.',
  '- 경기 용어가 나오면 괄호로 짧게 풀어 줘라. 독자는 모를 수 있다.',
  '  보기: VSC(가상 세이프티카. 전 구간이 속도를 줄인다)',
  '  이건 용어를 풀어 주는 것뿐이다. 사건에 없던 사실을 보태라는 말이 아니다.',
  '',
  '── 이런 문장은 한 줄도 쓰지 마라 ──',
  '- "큰 관심이 쏠린다", "귀추가 주목된다", "중요한 의미를 가진다" 처럼',
  '  읽고 나도 아는 게 하나도 안 늘어나는 문장.',
  '- 원문에 없는 전망이나 평가. "앞으로 나아질 것으로 보인다" 같은 말.',
  '- 제목을 말만 바꿔 되풀이한 문장. 제목에 없는 것을 써라.',
  '',
  '── 문장 쓰는 법 ──',
  '- 한 문장에 사실 하나. 두 가지를 접속사로 억지로 잇지 마라.',
  '- 한 문장은 60자 안쪽으로. 길어지면 끊어라.',
  '- 주어를 분명히 써라. 누가 한 일인지 헷갈리면 안 된다.',
  '- 어려운 한자어 대신 쉬운 말을 써라.',
  '',
  '── 절대 규칙 ──',
  '- 준 글에 없는 사실을 절대 지어내지 마라.',
  '- 숫자, 순위, 랩 수, 날짜, 점수, 나이를 만들지 마라. 준 글에 있는 것만 쓴다.',
  '- 알 수 없는 항목은 그 줄에 - 한 글자만 적어라. 억지로 채우지 마라.',
  '- 원문의 강도를 바꾸지 마라. 검토·추진·설·가능성을 정해진 일처럼 쓰지 마라.',
  '- 원문 문장을 그대로 옮기지 마라. 따옴표 한 마디만 예외다.',
  '- 표기표에 있는 이름은 표기표대로 쓴다.',
  '- 원문이 독일어·일본어여도 우리말로 쓴다. 일본 이름(한자·가타카나)은 한국에서 쓰는',
  '  소리대로 성 이름 순으로 쓴다(坪井翔 → 쓰보이 쇼).',
  '- 표기표에 없는 사람·팀·서킷 이름은 한글로 옮기지 마라. 영어 그대로 둬라.',
  '  네가 소리 나는 대로 적으면 같은 사람이 글마다 다른 이름이 된다.',
  '  보기: Isack Hadjar 를 이자크 하다르 라고 적지 마라. Isack Hadjar 로 둬라.',
  '- 영어로 두는 건 사람·팀·서킷의 고유한 이름뿐이다. 보통 낱말은 반드시',
  '  우리말로 옮겨라. team principal 은 팀 대표, engineer 는 엔지니어,',
  '  practice 는 연습주행, qualifying 은 예선, standings 는 순위다.',
  '  medium 은 미디엄 타이어, racing incident 는 레이싱 인시던트, restart 는 리스타트,',
  '  podium 은 포디엄, stewards 는 심판진, organisers 는 주최 측이다.',
  '- 한자를 쓰지 마라. 느낌표를 쓰지 마라.',
  '- 문장은 -다 로 끝낸다. 존댓말을 쓰지 마라.',
  '',
  '── 보기 ──',
  '나쁨 [무슨 일] 해밀턴이 언론 보도를 부인했다. 이번 일로 팀 내부 상황에 큰 관심이 쏠린다.',
  '     왜 나쁜가 — 무엇을 부인했는지가 없다. 둘째 문장은 읽어도 아는 게 안 는다.',
  '',
  '좋음 [무슨 일] 해밀턴이 페라리에 팀 관계자를 바꿔 달라고 요구했다는 보도를 부인했다.',
  '     이탈리아 신문 코리에레 델라 세라가 먼저 쓴 내용이다.',
  '     그는 "그런 요청을 한 적 없다"고 말했다.',
  '     다만 2026시즌을 앞두고 그의 레이싱 엔지니어는 실제로 바뀌었다.',
  '',
  '위 보기는 쓰는 법만 보여준다. 문구를 그대로 가져다 쓰지 마라.',
  '',
  '── 출력 ──',
  '- 대괄호 항목 세 개만 출력한다. 항목마다 줄을 바꾼다.',
  '- 생각 과정을 쓰지 마라.',
].join('\n');

const unent = x => String(x || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#0?39;|&rsquo;|&#8217;|&apos;/g, "'")
  .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
  .replace(/&hellip;|&#8230;/g, '...')
  .replace(/&mdash;|&#8212;|&ndash;|&#8211;/g, '-');

/* 기사 페이지에서 본문 글만 뽑습니다. 요약에 쓸 재료일 뿐이고
   원문을 그대로 보여주지는 않습니다 (프롬프트에서도 막아 뒀습니다).

   앱은 세 곳에서 소식을 받는데 페이지 생김새가 제각각입니다.
     motorsport.com  구조화 데이터에 본문이 들어 있습니다
     autosport.com   같은 방식입니다
     crash.net       구조화 데이터가 없어 문단을 직접 긁어야 합니다
   그래서 세 갈래로 시도합니다.                                      */

/* 기사가 아니라 화면 장식인 문구들. 그냥 두면 요약에 섞여 들어갑니다. */
const JUNK = [
  /Prefer Crash\.Net on Google/gi,
  /See our stories more often/gi,
  /Sign up to our newsletter/gi,
  /Subscribe to [^.]{0,40}/gi,
  /Read more:?/gi,
  /Follow us on [^.]{0,30}/gi,
];
const clean = t => JUNK.reduce((x, re) => x.replace(re, ' '), t).replace(/\s+/g, ' ').trim();

function paras(html, limit) {
  const ps = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let x;
  while ((x = re.exec(html))) {
    const t = clean(unent(x[1].replace(/<[^>]+>/g, '')));
    if (t.length >= 60) ps.push(t);          /* 짧은 줄은 사진 설명이나 버튼 */
    if (ps.join(' ').length > limit) break;
  }
  return ps;
}

/* 앱이 소식을 받아 오는 세 곳의 기사 주소인지.
   /api/cards 와 /api/deep 은 누구나 부를 수 있어서, 이게 없으면 아무 주소와
   아무 제목이나 보내 공용 카드 표에 저장시킬 수 있었습니다.
   도메인 경계까지 봅니다 — 앞에 글자만 붙인 notmotorsport.com 은 안 됩니다. */
export const isPublisherLink = link =>
  /^https:\/\/(?:[\w-]+\.)*(?:motorsport\.com|autosport\.com|crash\.net|sportscar365\.com)\//i.test(String(link || ''));

export async function articleText(link) {
  const url = String(link || '').split('?')[0];
  if (!isPublisherLink(url)) return '';     /* 앱이 소식을 받아 오는 곳만 읽습니다 */
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    let html;
    try {
      const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' } });
      if (!r.ok) return '';
      html = await r.text();
    } finally { clearTimeout(timer); }

    /* ① 페이지에 심어 둔 구조화 데이터가 가장 깨끗합니다 */
    const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const one of blocks) {
      let j;
      try { j = JSON.parse(one.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '')); }
      catch (e) { continue; }
      for (const node of (Array.isArray(j) ? j : (j['@graph'] || [j]))) {
        if (node && typeof node.articleBody === 'string' && node.articleBody.length > 200)
          return clean(unent(node.articleBody)).slice(0, 3500);
      }
    }

    /* 글이 아닌 덩어리를 걷어냅니다 */
    const doc = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
      .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<form[\s\S]*?<\/form>/gi, ' ');

    /* ② 본문 칸이 표시돼 있으면 그 안만 */
    const m = doc.match(/class="[^"]*(?:ms-article-content|text-article|article-body|entry-content)[^"]*"[\s\S]*?(<p[\s\S]*)/i);
    if (m) {
      const ps = paras(m[1].slice(0, 300000), 3500);
      if (ps.join(' ').length > 400) return ps.join(' ').slice(0, 3500);
    }

    /* ③ 표시가 없으면 페이지 전체의 문단에서 */
    const ps = paras(doc, 3500);
    return ps.join(' ').length > 400 ? ps.join(' ').slice(0, 3500) : '';
  } catch (e) { return ''; }
}

/* ── 화제성 ─────────────────────────────────────────────────────
   카드뉴스에는 화제성 있는 기사만 올리고, 카드·설명문도 그것만 만듭니다.
   AI 를 쓰지 않습니다(호출 0회). 2026-10-02 실제 피드로 맞춘 기준입니다.

     +2  다른 회사 매체(Crash.net)도 같은 이야기를 다룸
     +1  같은 회사 매체(Autosport)도 다룸 — 거의 다 같이 실어서 약하게
     +2  우승·폴·사고·페널티·계약·이적·은퇴·부상·챔피언 같은 사건
     +1  큰 이름(베르스타펜·해밀턴·페라리·르망 …)
     +2 / +1 / 0 / -1   24시간·3일·1주 이내 / 1~2주 (SUPER GT·DTM 은 2~3주마다 경기라
                         1주 넘은 경기 기사가 많아 -2 로 두니 거의 다 빠졌습니다)
     -5  시청 방법·일정표·생중계·사진·퀴즈·팟캐스트 같은 안내 글
     2주 넘은 기사는 빼고(SUPER GT 피드에 2024년 기사가 섞여 있었습니다),
     2점 이상만, 부문마다 F1 8건·나머지 4건까지 → 하루 약 20건.
   무료 한도(하루 50번, 붐비면 실패)로 카드와 설명문을 둘 다 완성할 수 있는 양입니다. */
export const HOT_MAX = { f1: 8, other: 4 };
const HOT_STOP = new Set(('The A An And Or But For With From After Before About Into Over Under Why How What When Where ' +
  'Who This That These Those His Her Their Its Our Your Says Say Said Race Races Team Teams Driver Drivers New First ' +
  'Last Next Season Year Week Weekend Formula Grand Prix GP F1 WEC IMSA DTM GT GT3 Super Championship World Series ' +
  'Round Day Friday Saturday Sunday Practice Qualifying Free Will Can Could Would Should Has Have Had Not Get Gets ' +
  'Got Out Now Still Just More Most Very').split(' '));
const hotKeys = t => new Set((String(t).match(/[A-Z][A-Za-zÀ-ÿ'’-]{2,}/g) || [])
  .map(w => w.replace(/['’]s$/, '')).filter(w => !HOT_STOP.has(w)));
const HOT_BIG = /Verstappen|Hamilton|Leclerc|Norris|Piastri|Russell|Antonelli|Alonso|Hadjar|Ferrari|Red Bull|McLaren|Mercedes|Aston Martin|Toyota|Porsche|Cadillac|BMW|Penske|Ganassi|Le Mans|Daytona|Sebring|Spa|Suzuka|Fuji|Macau|Bathurst/i;
const HOT_EVENT = /\b(wins?|won|victory|pole|crash(es|ed)?|penalt(y|ies|ised|ized)|disqualif\w*|ban(ned)?|fined?|champion(ship)?|title|clinch\w*|contract|sign(s|ed|ing)?|joins?|leav(e|es|ing)|exit|replac\w*|retire\w*|injur\w*|hospital|record|debut|protest|appeal\w*|investigat\w*|confirm(s|ed)?|announc\w*|deal|split|axed|dropped|seat)\b/i;
/* 독일판 DTM · 일본판 SUPER GT 제목용. 일본어는 낱말 경계(\\b)가 없어 따로 둡니다 */
const HOT_EVENT_X = /優勝|勝利|連勝|ポール|クラッシュ|事故|ペナルティ|失格|王者|王座|タイトル|チャンピオン|契約|移籍|引退|負傷|記録|デビュー|抗議|決定|発表|Sieg|siegt|gewinnt|gewonnen|Unfall|Strafe|disqualifiziert|Titel|Meister|Vertrag|wechselt|Abschied|verletzt|Rekord|Debüt|bestätigt|gibt .{0,40}auf/i;
const HOT_BIG_X = /フェルスタッペン|ハミルトン|フェラーリ|トヨタ|ホンダ|日産|ニッサン|ポルシェ|TOM'?S|NISMO|ニスモ/i;
const HOT_GUIDE_X = /タイムスケジュール|放送予定|ライブ配信|フォトギャラリー|写真特集|プレゼント|Zeitplan|TV-Übertragung|Livestream|Liveticker|Fotostrecke|Bildergalerie|Gewinnspiel|Verlosung|In eigener Sache/i;
const HOT_GUIDE = /how to watch|schedule|start time|live (updates|blog|commentary)|as it happened|gallery|photos?\b|in pictures|podcast|quiz|weather forecast|tv times|entry list|\bresults?:|timetable/i;

/* items: {title, link, when}, others: {as:[{title,when}], cn:[…]} → 고른 기사 (점수 높은 순) */
export function hotPicks(items, others, max) {
  const now = Date.now(), DAY = 864e5;
  const recent = list => (list || []).filter(o => !o.when || now - o.when < 14 * DAY);
  const as = recent(others && others.as), cn = recent(others && others.cn);
  const covered = (K, list) => list.some(o => {
    let n = 0;
    for (const w of hotKeys(o.title)) if (K.has(w) && ++n >= 2) return true;
    return false;
  });
  return items.map(it => {
    const age = (now - (it.when || now)) / 3600e3;
    if (age > 14 * 24) return null;
    const K = hotKeys(it.title);
    let s = (covered(K, cn) ? 2 : 0) + (covered(K, as) ? 1 : 0)
          + (HOT_EVENT.test(it.title) || HOT_EVENT_X.test(it.title) ? 2 : 0)
          + (HOT_BIG.test(it.title) || HOT_BIG_X.test(it.title) ? 1 : 0)
          + (age < 24 ? 2 : age < 72 ? 1 : age < 168 ? 0 : -1)
          - (HOT_GUIDE.test(it.title) || HOT_GUIDE_X.test(it.title) ? 5 : 0);
    return { it, s };
  }).filter(x => x && x.s >= 2)
    .sort((a, b) => b.s - a.s || (b.it.when || 0) - (a.it.when || 0))
    .slice(0, max).map(x => x.it);
}

/* 기사 주소의 짧은 지문. 고른 목록을 표의 한 칸(120자)에 담으려고 씁니다.
   앱(index.html linkHash)과 똑같이 계산해야 합니다. */
export function linkHash(link) {
  const s = String(link || '').slice(0, 400).slice(-160);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export const deepIdOf = link => 'deep|' + String(link || '').slice(0, 400).slice(-160);

/* 이미 만들어 둔 풀이를 찾아옵니다 */
export async function loadDeep(links) {
  const { url, headers } = sbConf();
  const out = {};
  if (!links.length) return out;
  try {
    const ids = links.map(deepIdOf)
      .map(a => '"' + encodeURIComponent(a).replace(/"/g, '') + '"').join(',');
    const r = await fetch(url + '/rest/v1/cards?id=in.(' + ids + ')&select=*', { headers });
    if (r.ok) (await r.json()).forEach(row => {
      out[row.id] = { what: row.hook || '', why: row.punch || '', note: row.line || '' };
    });
  } catch (e) { /* 없으면 빈손으로 */ }
  return out;
}

function deepParse(text) {
  const s = String(text || '');
  const grab = name => {
    const m = s.match(new RegExp('\\[' + name + '\\]\\s*([\\s\\S]*?)(?=\\s*\\[(?:무슨 일|왜 중요|알아둘 것)\\]|$)'));
    const v = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    return (!v || /^-+$/.test(v)) ? '' : v;
  };
  const out = { what: grab('무슨 일'), why: grab('왜 중요'), note: grab('알아둘 것') };
  return out.what ? out : null;
}

/* 풀이용으로 모델을 부릅니다. 앞 모델이 안 되면 다음 모델로 넘어갑니다.
   parse 가 쓸 만한 답이라고 돌려준 것만 받습니다. */
async function deepAsk(sys, msg, key, deadline, capMs, parse, kind = 'deep') {
  let raw = '';
  const why = [];                     /* 모델마다 무엇 때문에 실패했는지 */
  for (const model of ENGINE ? ENGINE.models : await liveModels()) {
    const room = deadline - Date.now() - 2000;
    const callMs = Math.min(ENGINE ? ENGINE.callMs : capMs, room);
    if (callMs < 10000) break;
    if (!ENGINE) await spend(kind, model);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), callMs);
    try {
      const res = await fetch(engineUrl(), {
        method: 'POST', signal: ac.signal,
        headers: engineHeaders(key),
        body: JSON.stringify({
          /* 자세한 풀이는 카드보다 훨씬 깁니다. 6000 으로 뒀더니 생각 과정이
             한도를 다 먹고 본문이 한 글자도 안 나오는 일이 있었습니다. */
          model, temperature: 0.3, max_tokens: 14000, ...(ENGINE ? ENGINE.body : {}),
          messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }],
        }),
      });
      if (res.status === 429) {
        const e = await res.json().catch(() => ({}));
        const meta = (e && e.error && e.error.metadata) || {};
        const msg = String((e.error || {}).message || '') + ' ' + (meta.limit_source || '');
        if (/per-day|daily/i.test(msg))
          return { got: null, reason: 'daily-limit', why: why.concat('하루한도') };
        why.push('429 ' + msg.trim().slice(0, 60));
        continue;
      }
      if (!res.ok) { why.push('HTTP ' + res.status); continue; }
      const j = await res.json();
      const txt = j && j.choices && j.choices[0] && j.choices[0].message.content;
      const got = parse(txt);
      if (got) return { got, model };
      raw = String(txt || '(빈 답)').slice(0, 300);   /* 왜 실패했는지 남깁니다 */
      why.push(txt ? '형식 어긋남' : '빈 답');
    } catch (e) { why.push(/abort/i.test(String(e)) ? '시간초과' : String(e).slice(0, 40)); }
    finally { clearTimeout(timer); }
  }
  return { got: null, reason: 'all-models-failed', raw, why };
}

const named = d => ({ what: applyNames(d.what), why: applyNames(d.why), note: applyNames(d.note) });

/* 기사 하나를 길게 풀어 씁니다 */
export async function makeDeep(item, glossary, key, budgetMs) {
  await loadLearned();
  /* 예산은 원문을 받는 시간부터 셉니다. 받은 뒤부터 세면 원문이 느린 날에
     원문 12초 + 모델 45초 = 57초가 되어 상한(60초)에 아슬아슬합니다. */
  const t0 = Date.now();
  if (!ENGINE && await spentToday() >= DEEP_STOP)
    return { deep: null, reason: 'reserve', why: ['카드 몫 남김'] };
  const full = await articleText(item.link);
  const src = full || String(item.lead || '');
  if (!item.title) return { deep: null, reason: 'no-title' };

  /* 앱이 보낸 것에 더해, 원문 전체에 나오는 이름도 찾아 넣습니다 */
  const gl = [...new Set((glossary || []).concat(
    nameGlossary([item.title, item.lead || '', full])))].slice(0, 50);
  const msg = (gl.length
      ? '아래 이름은 반드시 이 표기를 써라:\n' + gl.join('\n') + '\n\n' : '')
    + '제목: ' + item.title + '\n본문: ' + (src || '(없음)');

  const r = await deepAsk(DEEP_SYS, msg, key, t0 + (budgetMs || 45000), 28000, txt => {
    const g = deepParse(txt);
    return g && !garbled(g.what + ' ' + g.why + ' ' + g.note) ? g : null;
  });
  if (!r.got) return { deep: null, reason: r.reason, raw: r.raw || '', why: r.why };
  return { deep: named(r.got), model: r.model, usedFull: !!full };
}

/* 기사 여러 건을 한 번에 풀어 씁니다.

   무료 한도는 글자 수가 아니라 '부른 횟수'로 셉니다 (하루 50회).
   한 건씩 부르면 화면의 60건에 60회라 한도를 넘습니다. 3건씩 묶으면
   20회로 끝납니다. 같은 한도로 세 배를 만드는 셈입니다.
   대신 한 번에 쓰는 글이 길어서 시간이 더 걸립니다. */
const DEEP_MANY_SYS = DEEP_SYS + '\n\n' + [
  '── 기사를 여러 개 받았을 때 ──',
  '- 기사마다 따로 쓴다. 그 번호 기사의 본문에 있는 사실만 쓴다.',
  '- 다른 번호 기사에 나온 사람·팀·숫자를 절대 가져오지 마라.',
  '- 기사마다 받은 번호 줄(=== 1 === 처럼)을 먼저 쓰고, 그 아래에 대괄호 항목 세 개를 쓴다.',
  '- 받은 기사 수만큼 빠짐없이 쓴다.',
].join('\n');

/* "=== 2 ===" 줄로 나눠 기사마다 풀이를 꺼냅니다. 못 꺼낸 자리는 null */
function deepSplit(text, n) {
  const out = new Array(n).fill(null);
  const parts = String(text || '').split(/^[\s*#]*=+[^\d\n]*(\d+)[^\n=]*=+[\s*]*$/m);
  for (let k = 1; k + 1 < parts.length; k += 2) {
    const i = parseInt(parts[k], 10) - 1;
    if (i >= 0 && i < n && !out[i]) out[i] = deepParse(parts[k + 1]);
  }
  return out;
}

export async function makeDeepBatch(items, key, budgetMs) {
  await loadLearned();
  if (items.length === 1) {
    const one = await makeDeep(items[0], [], key, budgetMs);
    return { deeps: one.deep ? [one.deep] : null, reason: one.reason, why: one.why, model: one.model };
  }
  const t0 = Date.now();
  if (!ENGINE && await spentToday() >= DEEP_STOP)
    return { deeps: null, reason: 'reserve', why: ['카드 몫 남김'] };
  const fulls = await Promise.all(items.map(it => articleText(it.link)));
  const gl = [...new Set(nameGlossary(items.flatMap((it, n) =>
    [it.title, it.lead || '', fulls[n]])))].slice(0, 60);
  /* 기사당 2500자. 셋이면 7500자로, 모델이 앞 기사만 읽고 지치지 않을 만큼 */
  const msg = (gl.length
      ? '아래 이름은 반드시 이 표기를 써라:\n' + gl.join('\n') + '\n\n' : '')
    + items.map((it, n) => '=== ' + (n + 1) + ' ===\n제목: ' + it.title + '\n본문: '
        + String(fulls[n] || it.lead || '(없음)').slice(0, 2500)).join('\n\n');

  /* 한 건짜리보다 오래 걸리므로 모델 하나에 45초까지 줍니다 */
  const r = await deepAsk(DEEP_MANY_SYS, msg, key, t0 + budgetMs, 45000, txt => {
    const got = deepSplit(txt, items.length)
      .map(g => g && !garbled(g.what + ' ' + g.why + ' ' + g.note) ? g : null);
    return got.some(Boolean) ? got : null;     /* 일부만 나와도 받습니다 */
  });
  if (!r.got) return { deeps: null, reason: r.reason, raw: r.raw || '', why: r.why };

  /* 섞임 검사. 묶어 보내면 모델이 기사끼리 헷갈릴 때가 있습니다.
     실제로 페레스(캐딜락 소속) 기사와 하자르 기사를 함께 보냈더니, 하자르
     풀이에 "레드불이 캐딜락으로 이름을 바꿨다"는 없는 말이 들어갔습니다.
     그 기사에는 안 나오고 같은 묶음의 다른 기사에만 나오는 이름이 풀이에
     있으면 버립니다. 버린 기사는 다음 갱신 때 다시 만들어집니다. */
  /* 이름과 그 낱말 하나하나를 모읍니다. 원문에 성만 나와도 풀이가
     "아이작 하자르"처럼 온이름을 쓰는 건 섞인 게 아닙니다. */
  const own = items.map((it, n) => new Set(
    nameGlossary([it.title, it.lead || '', fulls[n]], 999)
      /* 고유한 이름만 봅니다. 표에는 '예선'·'연습 주행' 같은 보통 용어도 있어서,
         그걸로 섞였다고 오판해 멀쩡한 풀이를 버렸습니다 (10/2 F1 세 건) */
      .filter(g => /^[A-Z0-9]/.test(g))
      .map(g => g.split(' = ')[1])));
  const mine = own.map(set => new Set([...set].flatMap(ko => [ko, ...ko.split(' ')])));
  const why = [];
  const deeps = r.got.map((d, k) => {
    if (!d) return null;
    const x = named(d);
    const txt = [x.what, x.why, x.note].join(' ');
    const alien = own.flatMap((set, j) => j === k ? [] : [...set])
      .filter(ko => ko.length >= 2 && !mine[k].has(ko) && !mine[k].has(ko.split(' ').pop())
                    && txt.includes(ko));
    if (alien.length) { why.push((k + 1) + '번 섞임 ' + [...new Set(alien)].join(',')); return null; }
    return x;
  });
  return { deeps: deeps.some(Boolean) ? deeps : null, model: r.model, why,
           reason: deeps.some(Boolean) ? undefined : 'mixed' };
}


/* ══════════════════════════════════════════════════════════════
   목록 제목 — 화제 카드가 아닌 나머지 기사의 제목

   목록 보기에서는 구글 번역 제목이 그대로 보였습니다. 직역이라
   'In eigener Sache: Gewinner der DTM-Verlosung …' 이 "우리를 대신하여:
   DTM 추첨의 우승자가 선정되었습니다" 가 됐습니다 (10/3, 실제 화면).
   한 부문 20건을 한 번에 AI 로 옮기면 호출 1회입니다. 이미 옮긴 기사는
   건너뛰므로, 부를 일은 새 기사가 올라왔을 때뿐입니다.
   앱은 이게 있으면 구글 번역 대신 씁니다. 없으면 지금처럼 구글 번역입니다. */
export const TITLE_STOP = 30;     /* 이만큼 쓰면 제목은 멈춥니다 — 카드(50)·풀이(35)가 먼저 */
export const titleIdOf = link => 'ti|' + linkHash(link);
/* 제목은 line 칸에 둡니다. 표의 길이 규칙(cards_len)이 hook·punch 는 40자,
   line 은 120자라서, hook 에 넣었더니 긴 제목이 섞인 묶음이 통째로 저장되지
   않았습니다 (10/3 PC 채우기에서 F1·WEC·IMSA·SUPER GT 0건) */

export const TITLE_SYS = [
  '너는 한국 모터스포츠 뉴스 편집자다.',
  '영어·독일어·일본어 기사 제목을 받아 우리말 기사 제목으로 옮긴다.',
  '',
  '── 규칙 ──',
  '- 직역하지 마라. 한국 스포츠 기사 제목처럼 짧고 자연스럽게 쓴다.',
  '- 뜻은 바꾸지 마라. 원문에 없는 사실·숫자·순위를 더하지 마라.',
  '- ::: 뒤는 기사 도입부다. 제목 뜻이 애매할 때만 참고하고, 제목에 옮겨 담지 마라.',
  '- 따옴표 속 말도 우리말로 옮겨 따옴표째 살리고, 말한 사람을 앞에 둔다.',
  '  외국어 문장을 그대로 남기지 마라.',
  '- 원문에 없는 낱말을 보태지 마라. 원문에 없으면 포디엄·폭발·우승 같은 말을 쓰지 마라.',
  '- 시간 차이는 소수로 쓴다 (73 Tausendstel → 0.073초).',
  '- 사람·팀·서킷 이름은 표기표가 있으면 표기표대로 쓴다. 표기표에 없는 이름은',
  '  원래 철자 그대로 둔다. 네가 소리 나는 대로 적으면 같은 사람이 제목마다 달라진다.',
  '- 일본 사람·팀 이름(한자·가타카나)은 한국에서 쓰는 소리대로 성 이름 순으로 쓴다',
  '  (坪井翔 → 쓰보이 쇼). 한자·가나를 남기지 마라.',
  '- 원문의 강도를 바꾸지 마라. 검토·추진·설·가능성을 정해진 일처럼 쓰지 마라.',
  '- 자주 틀리는 말: stewards=심판진, team principal=팀 대표, podium=포디엄,',
  '  pole=폴 포지션, shootout=슛아웃, restart=리스타트, organisers=주최 측.',
  '- 존댓말·마침표·느낌표 금지. 끝은 명사나 짧은 서술로 맺는다.',
  '',
  '── 보기 ── (보기 문구를 그대로 쓰지 마라)',
  '입력 [1] Leclerc explains vision issue after Monza crash',
  '출력 [1] 르클레르, 몬차 사고 원인은 "잠깐의 시야 문제"',
  '입력 [2] Why Porsche\'s IMSA title defence is under threat',
  '출력 [2] 포르쉐 IMSA 타이틀 방어에 빨간불, 이유는',
  '입력 [3] Rast verzichtet auf Testfahrten in Hockenheim',
  '출력 [3] 라스트, 호켄하임 테스트 불참',
  '',
  '── 출력 ──  [번호] 제목',
  '번호 하나당 한 줄. 합치거나 빠뜨리지 마라. 생각 과정을 쓰지 마라.',
].join('\n');

/* 이미 옮겨 둔 제목을 찾아옵니다 — { 'ti|지문': { t: 제목, by: 'pc' 이면 PC 가 옮긴 것 } } */
export async function loadTitles(links) {
  const { url, headers } = sbConf();
  const out = {};
  if (!links.length) return out;
  try {
    const ids = links.map(titleIdOf).map(a => '"' + a + '"').join(',');
    const r = await fetch(url + '/rest/v1/cards?id=in.(' + encodeURIComponent(ids) + ')&select=id,line,punch', { headers });
    if (r.ok) (await r.json()).forEach(row => { out[row.id] = { t: row.line || '', by: row.punch || '' }; });
  } catch (e) { /* 없으면 빈손으로 */ }
  return out;
}

/* 쓸 만한 제목인지. 한자·가나가 남았거나 도입부까지 옮겼으면 버립니다 */
const titleOk = s => !!s && s.length <= 120 && /[가-힣]/.test(s) && !garbled(s)
  && !/[\u3040-\u30FF\u4E00-\u9FFF]/.test(s) && !s.includes(':::');

/* 기사 묶음의 제목을 옮깁니다. 못 옮긴 자리는 null */
export async function makeTitles(items, key, budgetMs) {
  await loadLearned();
  const t0 = Date.now();
  if (!ENGINE && await spentToday() >= TITLE_STOP)
    return { titles: null, reason: 'reserve', why: ['카드·풀이 몫 남김'] };
  const gl = nameGlossary(items.map(it => it.title + ' ' + (it.lead || '')), 60);
  const body = items.map((it, i) => '[' + (i + 1) + '] ' + it.title
    + (it.lead ? OR_SEP + String(it.lead).slice(0, 160) : '')).join('\n');
  const msg = (gl.length ? '아래 이름은 반드시 이 표기를 써라:\n' + gl.join('\n') + '\n\n' : '') + body;

  const r = await deepAsk(TITLE_SYS, msg, key, t0 + budgetMs, 32000, txt => {
    const got = orParse(txt, items.length);
    if (!got) return null;
    const out = got.map(s => {
      const v = applyNames(String(s || '').replace(/[.。]$/, '').trim());
      return titleOk(v) ? v : null;
    });
    return out.some(Boolean) ? out : null;
  }, 'title');
  if (!r.got) return { titles: null, reason: r.reason, why: r.why };
  return { titles: r.got, model: r.model };
}

/* 한 달 지난 제목은 지웁니다. 목록에서 밀려난 지 오래라 다시 볼 일이 없습니다 */
export async function dropOldTitles() {
  const { url, headers } = sbConf();
  try {
    await fetch(url + '/rest/v1/cards?id=like.' + encodeURIComponent('ti|') + '*&at=lt.' +
      (Date.now() - 30 * 86400000), { method: 'DELETE', headers });
  } catch (e) { /* 다음 번에 지웁니다 */ }
}


/* ══════════════════════════════════════════════════════════════
   배운 이름 — 이름표에 없던 이름의 한글 표기

   이름표에 없는 이름은 모델이 영어 그대로 둡니다. 소리 나는 대로 적게 하면 같은
   사람이 카드마다 다르게 적히기 때문입니다. 그래서 'Vigna의 사실 강조' 처럼 영어가
   남았고, 그때마다 손으로 이름표에 넣었습니다 (10/3·10/4 Grasser·Rossi·Vigna).
   10/4 에 세어 보니 카드·제목·풀이에 영어로 남은 말이 201개였습니다.

   PC 가 하루 한 번(tools/local-fill.mjs) 결과에 영어로 남은 말을 모아 AI 에게
   한글 표기를 정하게 하고 '_nm|이름' 줄로 남깁니다. 서버와 앱은 그 줄을 이름표에
   붙여 씁니다 — 한 번 정한 표기를 모두가 같이 쓰므로 카드마다 달라지지 않고,
   이미 만든 카드도 화면에 그릴 때 바뀝니다.
   틀린 표기는 그 줄의 punch 를 고치면 됩니다. 이름이 아니라고 본 말(skip)과
   영어로 두는 상표(keep)도 줄로 남겨, 다음 날 다시 묻지 않습니다. */
const LEARN = '_nm|';
let learnedAt = 0;

function addNames(pairs) {
  const have = new Set(NAME_RE.map(([re]) => re.source));
  let n = 0;
  for (const [en, ko] of pairs) {
    const src = '\\b' + escRe(en) + '\\b';
    if (!en || !ko || have.has(src)) continue;
    NAME_RE.push([new RegExp(src, 'g'), ko]);
    have.add(src); n++;
  }
  if (n) {
    NAME_RE.sort((a, b) => b[0].source.length - a[0].source.length);   /* 긴 이름 먼저 */
    buildKoNameRe();
  }
  return n;
}

/* 한 시간에 한 번만 받아 옵니다 */
export async function loadLearned() {
  if (Date.now() - learnedAt < 3600000) return;
  learnedAt = Date.now();
  const { url, headers } = sbConf();
  try {
    const r = await fetch(url + '/rest/v1/cards?id=like.' + encodeURIComponent(LEARN) + '*&punch=neq.&select=hook,punch', { headers });
    if (r.ok) addNames((await r.json()).map(x => [x.hook, x.punch]));
  } catch (e) { /* 못 받으면 원래 이름표만 씁니다 */ }
}

/* 이미 정한 말(한글·keep·skip 모두) — 다시 묻지 않으려고 */
export async function decidedNames() {
  const { url, headers } = sbConf();
  try {
    const r = await fetch(url + '/rest/v1/cards?id=like.' + encodeURIComponent(LEARN) + '*&select=hook', { headers });
    if (r.ok) return new Set((await r.json()).map(x => x.hook));
  } catch (e) { /* 아래 빈 목록 */ }
  return new Set();
}

/* 한국어 글에 영어로 남은 이름. 약어(DTM·GT3·FIA)와 이름표에 있는 것은 뺍니다 */
const LATIN_SEQ = /[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*(?:\s+(?:van|de|der|da|di|von|du|[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*))*/g;
export function leftoverNames(ko) {
  const out = new Set();
  for (const m of String(ko || '').match(LATIN_SEQ) || []) {
    const w = m.replace(/(?:\s+(?:van|de|der|da|di|von|du))+$/, '').replace(/[.'’-]+$/, '');
    if (w.length < 4 || w.length > 40) continue;
    if (w.split(/\s+/).every(x => /^[A-Z0-9][A-Z0-9.'’-]*$/.test(x))) continue;
    if (nameGlossary([w], 1).length) continue;
    out.add(w);
  }
  return [...out];
}

/* 영어 원문(제목·도입부)에 나오는 '두 낱말 이상' 이름. 구글 번역 도입부에는 이름이
   영어로 남는데(Robby Foley·Toby Sowery), AI 를 거치지 않아 위 leftoverNames 로는
   못 찾습니다. 원문에서 미리 배워 두면 카드를 만들 때도 표기표로 넘어갑니다.
   한 낱말짜리는 문장 첫 말·요일 같은 게 너무 많이 섞여 뺍니다. 낱말마다 대문자인
   제목(Sportscar365 'Palou Joins Lone Star Racing')도 통째로 이름처럼 보여 뺍니다 */
const NAME_STOP = new Set(('The A An And Or But For With From After Before About Into Over Under Why How What When ' +
  'Where Who This That These Those His Her Their Its Our Your Will Can Could Should Would May Might Must Is Are ' +
  'Was Were In On At By Of To As If It He She They We I Not No Yes All Both Each Every Despite While During ' +
  'Since Until Watch Read Keep Here There Now Then Also Just Only Even Still So Than Following Ahead Inside Behind ' +
  /* 이름 앞 직함 ('Team Principal Laurent Mekies' → 'Laurent Mekies') */
  'Team Principal Boss Driver Drivers President Chairman Chief CEO Director Manager Champion Former Teammate').split(' '));
const SRC_SEQ = /[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]*(?:\s+(?:van|de|der|da|di|von|du|[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]*))+/g;
const titleCase = t => {
  const ws = String(t).split(/\s+/).filter(w => /^[A-Za-z]{4,}/.test(w));
  return ws.length >= 3 && ws.filter(w => /^[A-Z]/.test(w)).length / ws.length >= 0.7;
};
export function sourceNames(title, lead) {
  const txt = (titleCase(title) ? '' : title + '. ') + String(lead || '').replace(/Keep reading/g, '');
  const out = new Set();
  for (const m of txt.match(SRC_SEQ) || []) {
    const ws = m.split(/\s+/).map(x => x.replace(/['’]s$/, ''));
    while (ws.length && NAME_STOP.has(ws[0])) ws.shift();
    const w = ws.join(' ').replace(/(?:\s+(?:van|de|der|da|di|von|du))+$/, '').replace(/['’-]+$/, '');
    if (w.length < 4 || w.length > 40 || ws.length < 2) continue;
    if (w.split(/\s+/).every(x => /^[A-Z0-9][A-Z0-9'’-]*$/.test(x))) continue;
    if (nameGlossary([w], 1).length) continue;
    out.add(w);
  }
  return [...out];
}

const NAME_SYS = [
  '너는 한국 모터스포츠 매체의 외국어 표기 담당이다.',
  "줄마다 '외국어 ::: 그 말이 나온 기사 제목'을 받는다. 줄마다 답 하나만 쓴다.",
  '',
  '- 사람 이름: 국립국어원 외래어 표기법으로 한글로 쓴다. 그 사람 나라 말 소리를 따른다.',
  '  이름과 성 순서는 받은 그대로 둔다. (Pierre Gasly → 피에르 가슬리)',
  '  단 일본 사람은 한국에서 쓰는 대로 성 이름 순으로 바꾼다. (Sho Tsuboi → 쓰보이 쇼)',
  '- 팀·회사·자동차·서킷·대회 이름: 한국 매체가 쓰는 한글 표기로 쓴다.',
  '  (Lone Star Racing → 론스타 레이싱, Maserati → 마세라티)',
  '- 한국 매체도 영어 그대로 쓰는 스폰서 상표나 차 모델 코드는 KEEP 이라고 쓴다.',
  '- 이름이 아니거나(This, Hour, Racing) 이름이 잘려 불완전하면 SKIP 이라고 쓴다.',
  '- 확실하지 않으면 SKIP.',
  '',
  '── 출력 ──  [번호] 한글표기   또는   [번호] KEEP   또는   [번호] SKIP',
  '번호 하나당 한 줄. 설명을 붙이지 마라.',
].join('\n');

/* 첫소리가 맞는지 — Random 은 ㄹ, European 은 ㅇ 으로 시작해야 합니다.
   10/4 에 옆 줄 답이 밀려 와 'Random Vandals BMW M' 이 '마르쿠스 에릭슨',
   'European Series' 가 '마세라티' 가 됐습니다. 그때까지 배운 141개에 돌려 보니
   그 둘만 걸렸습니다. 낱말 수가 같으면 낱말마다, 다르면 첫 낱말만 봅니다 */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const FIRST_SOUND = {
  A: 'ㅇ', E: 'ㅇ', I: 'ㅇ', O: 'ㅇ', U: 'ㅇ', Y: 'ㅇ', H: 'ㅎㅇ', W: 'ㅇㅂ', J: 'ㅈㅇㅎ',
  B: 'ㅂㅃ', C: 'ㅋㅅㅊㅆㄲ', D: 'ㄷㄸ', F: 'ㅍ', G: 'ㄱㅈㅎㄲ', K: 'ㅋㄲ', L: 'ㄹ', M: 'ㅁ',
  N: 'ㄴ', P: 'ㅍㅃ', Q: 'ㅋ', R: 'ㄹ', S: 'ㅅㅆㅈㅊ', T: 'ㅌㄸㅊㅅ', V: 'ㅂㅍ', X: 'ㅅㅈㅋㅎ', Z: 'ㅈㅊ',
};
function soundsLike(en, ko) {
  const a = en.split(/\s+/).filter(w => !/^[A-Z0-9]+$/.test(w));     /* GT·BMW 같은 약어는 건너뜀 */
  const b = ko.split(/\s+/).filter(w => /^[가-힣]/.test(w));
  if (!a.length || !b.length) return true;
  const ok = (w, k) => {
    const want = FIRST_SOUND[w.normalize('NFD')[0].toUpperCase()];
    return !want || want.includes(CHO[Math.floor((k.charCodeAt(0) - 0xAC00) / 588)]);
  };
  if (a.length !== b.length) return ok(a[0], b[0]);
  /* 일본 이름은 성 이름 순으로 뒤집어 적으므로 거꾸로도 맞춰 봅니다 (Yuto Nomura → 노무라 유토) */
  return a.every((w, i) => ok(w, b[i])) || a.every((w, i) => ok(w, b[b.length - 1 - i]));
}

/* 말 묶음의 표기를 정해 표에 남기고, 바로 이름표에도 붙입니다. 남긴 줄을 돌려줍니다 */
export async function learnNames(cands, key, budgetMs) {
  if (!cands.length) return [];
  const msg = cands.map((c, i) => '[' + (i + 1) + '] ' + c.w + OR_SEP + c.ctx).join('\n');
  const r = await deepAsk(NAME_SYS, msg, key, Date.now() + budgetMs, 60000, txt => orParse(txt, cands.length), 'name');
  if (!r.got) return [];
  let rows = [];
  r.got.forEach((v, i) => {
    const t = String(v || '').replace(/[.。]$/, '').trim();
    let ko = '', how;
    if (/^KEEP\b/i.test(t)) how = 'keep';
    else if (/^SKIP\b/i.test(t)) how = 'skip';
    else if (/^[가-힣]+(?:[ ·-][가-힣]+)*$/.test(t) && t.length <= 30) { ko = t; how = 'ko'; }
    else return;                                  /* 알아볼 수 없는 답은 다음 날 다시 */
    /* 낱말 수가 절반도 안 되면 다른 줄의 답이 밀려 온 것입니다
       (10/4 'GT World Challenge Europe Cup' → '막스 페르스타펜') */
    if (ko && ko.split(' ').length < Math.ceil(cands[i].w.split(/\s+/).length / 2)) return;
    if (ko && !soundsLike(cands[i].w, ko)) return;
    rows.push({ id: LEARN + cands[i].w, hook: cands[i].w, punch: ko,
                line: (how + ' ' + cands[i].ctx).slice(0, 120), at: Date.now() });
  });
  /* 서로 다른 말에 같은 한글이 붙었으면 둘 다 버립니다 — 하나는 밀려 온 답입니다
     (10/4 Bartone·GetSpeed 가 둘 다 '바르토네'). 다음 날 다시 묻습니다 */
  const seen = {};
  rows.forEach(x => { if (x.punch) seen[x.punch] = (seen[x.punch] || 0) + 1; });
  rows = rows.filter(x => !x.punch || seen[x.punch] === 1);
  await saveCards(rows);
  addNames(rows.filter(x => x.punch).map(x => [x.hook, x.punch]));
  return rows;
}
