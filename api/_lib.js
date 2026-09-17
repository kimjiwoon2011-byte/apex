/* 카드 만들기 공통 부분. api/cards.js (앱이 부름) 와 api/cron.js (정해진
 * 시각에 저절로 도는 것) 가 같이 씁니다. 파일 이름이 _ 로 시작하면
 * Vercel 이 주소로 열어 주지 않습니다. */

export const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OR_MODELS = [
  'inclusionai/ling-3.0-flash-fin:free',
  'nex-agi/nex-n2.5-mini:free',
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
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
  '- 이름은 표기표를 그대로 써라. 표기표에 없으면 영어 그대로 둔다.',
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
  const msg = (glossary && glossary.length)
    ? '아래 이름은 반드시 이 표기를 써라:\n' + glossary.join('\n') + '\n\n' + body
    : body;

  const deadline = Date.now() + (budgetMs || 50000);
  for (const model of OR_MODELS) {
    /* 한 번에 줄 시간을 남은 시간에 맞춰 정합니다. 20초로 못박아 두었더니
       기사가 6건만 돼도 다 못 만들고 잘렸습니다 — F1 에서 모델 둘이 연달아
       20초에 잘려 한 장도 못 건졌습니다. 첫 번째에 넉넉히 주고, 시간이
       남으면 짧게 한 번 더 해 봅니다. 뒤에 저장과 다음 부문 호출이
       남아 있으므로 2초는 떼어 둡니다. */
    const room = deadline - Date.now() - 2000;
    const callMs = Math.min(28000, room);
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
        if (/per-day|daily/i.test(String((e.error || {}).message || '') + (meta.limit_source || '')))
          return { cards: null, reason: 'daily-limit' };
        continue;                                /* 잠깐 몰린 것뿐이니 다음 모델로 */
      }
      if (!res.ok) continue;
      const j = await res.json();
      const got = orParse(j && j.choices && j.choices[0] && j.choices[0].message.content, items.length);
      if (!got) continue;
      const cards = got.map(s => {
        if (!s) return null;
        const p = s.split(/\s*:{2,}\s*/).map(x => x.trim()).filter(Boolean);
        if (p.length < 2) return null;
        const c = { h: p[0] || '', p: p[1] || '', d: p[2] || '' };
        return cardOk(c) ? c : null;
      });
      if (cards.some(Boolean)) return { cards, model };
    } catch (e) { /* 다음 모델로 */ }
    finally { clearTimeout(timer); }
  }
  return { cards: null, reason: 'all-models-failed' };
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
  '- 원문 문장을 그대로 옮기지 마라. 따옴표 한 마디만 예외다.',
  '- 사람·팀·서킷 이름은 표기표를 그대로 써라. 표기표에 없으면 영어 그대로 둔다.',
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
   원문을 그대로 보여주지는 않습니다 (프롬프트에서도 막아 뒀습니다). */
export async function articleText(link) {
  const url = String(link || '').split('?')[0];
  if (!/^https:\/\/[\w.-]*motorsport\.com\//i.test(url)) return '';   /* 아는 곳만 */
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
    for (const b of blocks) {
      let j;
      try { j = JSON.parse(b.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '')); }
      catch (e) { continue; }
      for (const node of (Array.isArray(j) ? j : (j['@graph'] || [j]))) {
        if (node && typeof node.articleBody === 'string' && node.articleBody.length > 200)
          return unent(node.articleBody).replace(/\s+/g, ' ').trim().slice(0, 3500);
      }
    }

    /* ② 없으면 본문 칸 안의 문단만. 짧은 줄은 사진 설명이나 버튼입니다 */
    const m = html.match(/class="[^"]*ms-article-content[^"]*"[\s\S]*?(<p[\s\S]*)/i);
    if (!m) return '';
    const ps = [];
    const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let x;
    while ((x = re.exec(m[1].slice(0, 200000)))) {
      const txt = unent(x[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (txt.length >= 60) ps.push(txt);
      if (ps.join(' ').length > 3500) break;
    }
    return ps.join(' ').slice(0, 3500);
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
  const full = await articleText(item.link);
  const src = full || String(item.lead || '');
  if (!item.title) return { deep: null, reason: 'no-title' };

  const msg = (glossary && glossary.length
      ? '아래 이름은 반드시 이 표기를 써라:\n' + glossary.join('\n') + '\n\n' : '')
    + '제목: ' + item.title + '\n본문: ' + (src || '(없음)');

  const deadline = Date.now() + (budgetMs || 45000);
  for (const model of OR_MODELS) {
    const room = deadline - Date.now() - 2000;
    const callMs = Math.min(25000, room);
    if (callMs < 10000) break;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), callMs);
    try {
      const res = await fetch(OR_URL, {
        method: 'POST', signal: ac.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.3, max_tokens: 6000,
          messages: [{ role: 'system', content: DEEP_SYS }, { role: 'user', content: msg }],
        }),
      });
      if (res.status === 429) {
        const e = await res.json().catch(() => ({}));
        const meta = (e && e.error && e.error.metadata) || {};
        if (/per-day|daily/i.test(String((e.error || {}).message || '') + (meta.limit_source || '')))
          return { deep: null, reason: 'daily-limit' };
        continue;
      }
      if (!res.ok) continue;
      const j = await res.json();
      const got = deepParse(j && j.choices && j.choices[0] && j.choices[0].message.content);
      if (got) return { deep: got, model, usedFull: !!full };
    } catch (e) { /* 다음 모델로 */ }
    finally { clearTimeout(timer); }
  }
  return { deep: null, reason: 'all-models-failed' };
}
