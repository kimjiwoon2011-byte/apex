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
  return out;
}

export const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
/* 순서는 같은 기사 5건으로 직접 재서 정했습니다 (2026-09-24).
     ling-flash   18.3초 5/5      nex-mini   20.5초 5/5
     gemma-4      다른 사용자가 몰려 거절(429) — 되면 빠릅니다
     dots·nemotron  28초 시간초과 — 맨 뒤에 둡니다
   앞의 둘은 번역 품질이 비슷하고, 둘 다 이름표를 정확히 따랐습니다. */
export const OR_MODELS = [
  'inclusionai/ling-3.0-flash-fin:free',
  'nex-agi/nex-n2.5-mini:free',
  'google/gemma-4-31b-it:free',
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];
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
  '- 원문의 강도를 바꾸지 마라. considers·plans·eyes 는 검토·추진, rumoured 는 설,',
  '  could·may 는 가능성이다. 정해지지 않은 일을 도입·확정이라고 쓰지 마라.',
  '- 자주 틀리는 말: shootout=슛아웃, wet=젖은 노면, lost his temper=격분,',
  '  team principal=팀 대표, stewards=심사위원, title=챔피언십 타이틀.',
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
  for (const model of OR_MODELS) {
    /* 한 번에 줄 시간을 남은 시간에 맞춰 정합니다. 20초로 못박아 두었더니
       기사가 6건만 돼도 다 못 만들고 잘렸습니다 — F1 에서 모델 둘이 연달아
       20초에 잘려 한 장도 못 건졌습니다. 첫 번째에 넉넉히 주고, 시간이
       남으면 짧게 한 번 더 해 봅니다. 뒤에 저장과 다음 부문 호출이
       남아 있으므로 2초는 떼어 둡니다. */
    const room = deadline - Date.now() - 2000;
    /* 한 모델에 24초까지. 전에는 28초라 첫 모델이 느리면 묶음 시간을 다
       먹어 다음 모델로 못 넘어갔습니다 (WEC·IMSA 가 그래서 통째로 실패). */
    const callMs = Math.min(24000, room);
    if (callMs < 12000) break;                  /* 한 번 돌릴 시간이 없으면 중단 */

    /* 시계는 본문을 다 읽을 때까지 살려 둡니다. 머리글이 오자마자 껐더니,
       답을 천천히 흘려 보내는 모델에서 res.json() 이 하염없이 기다렸고
       함수가 60초에 죽었습니다. */
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), callMs);
    try {
      const res = await fetch(OR_URL, {
        method: 'POST', signal: ac.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.3, max_tokens: 9000,
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
  '- 표기표에 없는 사람·팀·서킷 이름은 한글로 옮기지 마라. 영어 그대로 둬라.',
  '  네가 소리 나는 대로 적으면 같은 사람이 글마다 다른 이름이 된다.',
  '  보기: Isack Hadjar 를 이자크 하다르 라고 적지 마라. Isack Hadjar 로 둬라.',
  '- 영어로 두는 건 사람·팀·서킷의 고유한 이름뿐이다. 보통 낱말은 반드시',
  '  우리말로 옮겨라. team principal 은 팀 대표, engineer 는 엔지니어,',
  '  practice 는 연습주행, qualifying 은 예선이다.',
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

export async function articleText(link) {
  const url = String(link || '').split('?')[0];
  /* 앱이 소식을 받아 오는 곳만 읽습니다 */
  if (!/^https:\/\/[\w.-]*(motorsport\.com|autosport\.com|crash\.net)\//i.test(url)) return '';
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
    const m = s.match(new RegExp('\\[' + name + '\\]\\s*([\\s\\S]*?)(?=\\n?\\[|$)'));
    const v = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    return (!v || /^-+$/.test(v)) ? '' : v;
  };
  const out = { what: grab('무슨 일'), why: grab('왜 중요'), note: grab('알아둘 것') };
  return out.what ? out : null;
}

/* 기사 하나를 길게 풀어 씁니다 */
export async function makeDeep(item, glossary, key, budgetMs) {
  /* 예산은 원문을 받는 시간부터 셉니다. 받은 뒤부터 세면 원문이 느린 날에
     원문 12초 + 모델 45초 = 57초가 되어 상한(60초)에 아슬아슬합니다. */
  const t0 = Date.now();
  const full = await articleText(item.link);
  const src = full || String(item.lead || '');
  if (!item.title) return { deep: null, reason: 'no-title' };

  /* 앱이 보낸 것에 더해, 원문 전체에 나오는 이름도 찾아 넣습니다 */
  const gl = [...new Set((glossary || []).concat(
    nameGlossary([item.title, item.lead || '', full])))].slice(0, 50);
  const msg = (gl.length
      ? '아래 이름은 반드시 이 표기를 써라:\n' + gl.join('\n') + '\n\n' : '')
    + '제목: ' + item.title + '\n본문: ' + (src || '(없음)');

  const deadline = t0 + (budgetMs || 45000);
  let raw = '';
  const why = [];                     /* 모델마다 무엇 때문에 실패했는지 */
  for (const model of OR_MODELS) {
    const room = deadline - Date.now() - 2000;
    const callMs = Math.min(28000, room);
    if (callMs < 10000) break;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), callMs);
    try {
      const res = await fetch(OR_URL, {
        method: 'POST', signal: ac.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          /* 자세한 풀이는 카드보다 훨씬 깁니다. 6000 으로 뒀더니 생각 과정이
             한도를 다 먹고 본문이 한 글자도 안 나오는 일이 있었습니다. */
          model, temperature: 0.3, max_tokens: 14000,
          messages: [{ role: 'system', content: DEEP_SYS }, { role: 'user', content: msg }],
        }),
      });
      if (res.status === 429) {
        const e = await res.json().catch(() => ({}));
        const meta = (e && e.error && e.error.metadata) || {};
        const msg = String((e.error || {}).message || '') + ' ' + (meta.limit_source || '');
        if (/per-day|daily/i.test(msg))
          return { deep: null, reason: 'daily-limit', why: why.concat('하루한도') };
        why.push('429 ' + msg.trim().slice(0, 60));
        continue;
      }
      if (!res.ok) { why.push('HTTP ' + res.status); continue; }
      const j = await res.json();
      const txt = j && j.choices && j.choices[0] && j.choices[0].message.content;
      const got = deepParse(txt);
      if (got) return { deep: { what: applyNames(got.what), why: applyNames(got.why),
                                note: applyNames(got.note) }, model, usedFull: !!full };
      raw = String(txt || '(빈 답)').slice(0, 300);   /* 왜 실패했는지 남깁니다 */
      why.push(txt ? '형식 어긋남' : '빈 답');
    } catch (e) { why.push(/abort/i.test(String(e)) ? '시간초과' : String(e).slice(0, 40)); }
    finally { clearTimeout(timer); }
  }
  return { deep: null, reason: 'all-models-failed', raw, why };
}
