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

  const deadline = Date.now() + (budgetMs || 42000);
  for (const model of OR_MODELS) {
    if (Date.now() + 21000 > deadline) break;   /* 한 번 돌릴 시간이 없으면 중단 */
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 20000);
      const res = await fetch(OR_URL, {
        method: 'POST', signal: ac.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.3, max_tokens: 9000,
          messages: [{ role: 'system', content: OR_SYS }, { role: 'user', content: msg }],
        }),
      });
      clearTimeout(timer);
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
