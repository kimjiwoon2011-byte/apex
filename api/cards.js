/* 카드뉴스를 서버에서 만듭니다.
 *
 * 왜 서버인가 — AI 키를 기기마다 넣어야 해서, 키를 안 넣은 휴대폰에서는
 * 카드가 하나도 안 보였습니다. 키를 Vercel 환경변수에 한 번 두면 어느
 * 기기에서 열든 서버가 만들어 주고, 만든 건 Supabase 에 쌓여 다음부터는
 * 아무도 다시 만들지 않습니다.
 *
 * 필요한 환경변수 (Vercel → Settings → Environment Variables)
 *   OPENROUTER_KEY   필수. openrouter.ai 의 sk-or-v1-... 키
 *   SUPABASE_URL     선택. 없으면 아래 기본값
 *   SUPABASE_KEY     선택. 없으면 아래 기본값 (publishable 키라 공개돼도 됩니다)
 *
 * 주의 — 키를 이 파일에 적지 마세요. 저장소가 공개라 그대로 남에게 넘어갑니다.
 */

export const config = { maxDuration: 60 };   /* AI 한 번이 20~30초 걸립니다 */

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODELS = [
  'inclusionai/ling-3.0-flash-fin:free',
  'nex-agi/nex-n2.5-mini:free',
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
];
const OR_SEP = ' ::: ';

/* 앱 안의 프롬프트와 같은 것입니다. 서버가 프롬프트를 쥐고 있어야
   이 주소가 남의 OpenRouter 대리 호출기로 쓰이지 않습니다. */
const OR_SYS = [
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

async function makeCards(items, glossary, key) {
  const body = items.map((it, i) => '[' + (i + 1) + '] ' + it.title + OR_SEP + cut(it.lead)).join('\n');
  const msg = (glossary && glossary.length)
    ? '아래 이름은 반드시 이 표기를 써라:\n' + glossary.join('\n') + '\n\n' + body
    : body;

  const deadline = Date.now() + 50000;          /* 함수 상한 60초 안에서 끝냅니다 */
  for (const model of OR_MODELS) {
    if (Date.now() > deadline) break;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 28000);
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const KEY = process.env.OPENROUTER_KEY;
  if (!KEY) return res.status(500).json({ error: 'OPENROUTER_KEY 환경변수가 없습니다' });

  const SB_URL = process.env.SUPABASE_URL || 'https://nlwfmhrhbgzvvenztejn.supabase.co';
  const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_7CfWUlT7GDETfQwp3Ga-tw_Z6cN-up4';

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const items = (body && Array.isArray(body.items)) ? body.items.slice(0, 10) : null;
  const glossary = (body && Array.isArray(body.glossary)) ? body.glossary.slice(0, 40) : [];
  if (!items || !items.length)
    return res.status(400).json({ error: 'items 가 필요합니다 ([{link,title,lead}])' });

  /* 남이 이 주소로 아무 글이나 밀어 넣지 못하게 길이를 제한합니다 */
  const clean = items
    .filter(it => it && it.link && it.title)
    .map(it => ({ link: String(it.link).slice(0, 400),
                  title: String(it.title).slice(0, 300),
                  lead: String(it.lead || '').slice(0, 600) }));
  if (!clean.length) return res.status(400).json({ error: 'items 형식이 잘못됐습니다' });

  const sbHeaders = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  const keyOf = it => 'ko|' + it.link.slice(-160);

  /* 이미 서버에 있는 건 다시 만들지 않습니다 */
  let existing = {};
  try {
    const ids = clean.map(keyOf).map(a => '"' + encodeURIComponent(a).replace(/"/g, '') + '"').join(',');
    const r = await fetch(SB_URL + '/rest/v1/cards?id=in.(' + ids + ')&select=*', { headers: sbHeaders });
    if (r.ok) (await r.json()).forEach(row => { existing[row.id] = { h: row.hook || '', p: row.punch || '', d: row.line || '' }; });
  } catch (e) { /* 없으면 그냥 다 만듭니다 */ }

  const todo = clean.filter(it => !existing[keyOf(it)]);
  if (!todo.length)
    return res.status(200).json({ made: 0, cached: clean.length, cards: existing });

  const out = await makeCards(todo, glossary, KEY);
  if (!out.cards)
    return res.status(200).json({ made: 0, cached: Object.keys(existing).length,
                                  cards: existing, note: out.reason });

  /* 만든 건 바로 저장해 둡니다 */
  const rows = [];
  out.cards.forEach((c, i) => {
    if (!c || !c.p) return;
    const id = keyOf(todo[i]);
    existing[id] = c;
    rows.push({ id, hook: (c.h || '').slice(0, 40), punch: (c.p || '').slice(0, 40),
                line: (c.d || '').slice(0, 120), at: Date.now() });
  });
  if (rows.length) {
    try {
      await fetch(SB_URL + '/rest/v1/cards?on_conflict=id', {
        method: 'POST',
        headers: Object.assign({}, sbHeaders, { Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify(rows),
      });
    } catch (e) { /* 저장 실패해도 만든 건 돌려줍니다 */ }
  }

  res.status(200).json({ made: rows.length, cached: clean.length - todo.length,
                         model: out.model, cards: existing });
}
