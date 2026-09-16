/* 정해진 시각에 저절로 돌면서 카드를 미리 만들어 둡니다.
 *
 * 왜 필요한가 — 지금까지는 누군가 앱을 열어야 카드가 만들어졌습니다. 그래서
 * 새 기사가 올라온 뒤 처음 여는 사람은 20~30초를 기다려야 했고, 아무도 안
 * 열면 아예 안 만들어졌습니다. 미리 만들어 두면 열자마자 바로 보입니다.
 *
 * 한 번에 6개 부문을 다 못 합니다 — 부문당 20~30초인데 함수 상한이 60초입니다.
 * 그래서 부문 하나를 끝내고 스스로 다음 부문을 불러 이어 갑니다(기다리지 않고
 * 던지기만 합니다). 6번이 사슬처럼 이어집니다.
 */
import { makeCards, keyOf, loadExisting, saveCards } from './_lib.js';

export const maxDuration = 60;

/* 부문과 Motorsport.com 피드 이름 */
const SERIES = [
  { k: 'f1',   feed: 'f1' },
  { k: 'wec',  feed: 'wec' },
  { k: 'imsa', feed: 'imsa' },
  { k: 'dtm',  feed: 'dtm' },
  { k: 'sgt',  feed: 'supergt' },
  { k: 'gt',   feed: 'gt' },
];
const CARDS_PER_SERIES = 10;

/* RSS 를 정규식으로 읽습니다. 서버에는 DOMParser 가 없고, 필요한 건
   제목·주소·도입부 셋뿐이라 이 정도면 충분합니다. */
function parseRss(xml) {
  const items = [];
  const blocks = xml.split(/<item[\s>]/).slice(1);
  for (const b of blocks) {
    const pick = tag => {
      const m = b.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
      if (!m) return '';
      return m[1]
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    };
    const link = pick('link').split('?')[0];
    const title = pick('title');
    if (link && title) items.push({ link, title, lead: pick('description') });
    if (items.length >= CARDS_PER_SERIES) break;
  }
  return items;
}

export default async function handler(req, res) {
  const KEY = process.env.OPENROUTER_KEY;
  if (!KEY) return res.status(500).json({ error: 'OPENROUTER_KEY 환경변수가 없습니다' });

  /* 남이 함부로 돌리지 못하게. CRON_SECRET 을 넣어 두면 그 값이 있어야
     돕니다. 안 넣었으면 Vercel 의 정기 실행만 통과시킵니다. */
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const fromVercel = /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (secret ? auth !== 'Bearer ' + secret : !fromVercel)
    return res.status(401).json({ error: '허용되지 않은 요청입니다' });

  const i = Math.max(0, Math.min(SERIES.length - 1, parseInt(req.query.i, 10) || 0));
  const s = SERIES[i];
  const t0 = Date.now();
  const out = { series: s.k, made: 0, cached: 0 };

  try {
    const r = await fetch('https://www.motorsport.com/rss/' + s.feed + '/news/',
                          { headers: { 'User-Agent': 'APEX/1.0' } });
    if (!r.ok) throw new Error('RSS HTTP ' + r.status);
    const items = parseRss(await r.text());
    if (!items.length) throw new Error('기사 없음');

    const existing = await loadExisting(items.map(x => x.link));
    const todo = items.filter(x => !existing[keyOf(x.link)]);
    out.cached = items.length - todo.length;

    if (todo.length) {
      /* 남은 시간에서 저장·다음 호출 몫을 빼고 씁니다 */
      const budget = 45000 - (Date.now() - t0);
      const made = await makeCards(todo, [], KEY, budget);
      if (made.cards) {
        const rows = [];
        made.cards.forEach((c, n) => {
          if (!c || !c.p) return;
          rows.push({ id: keyOf(todo[n].link),
                      hook: (c.h || '').slice(0, 40), punch: (c.p || '').slice(0, 40),
                      line: (c.d || '').slice(0, 120), at: Date.now() });
        });
        out.made = await saveCards(rows);
        out.model = made.model;
      } else {
        out.note = made.reason;
        /* 하루 한도를 다 썼으면 다음 부문도 어차피 안 됩니다. 사슬을 끊습니다. */
        if (made.reason === 'daily-limit') {
          return res.status(200).json(Object.assign(out, { chain: 'stopped' }));
        }
      }
    }
  } catch (e) {
    out.error = String(e).slice(0, 120);
  }

  /* 다음 부문을 이어 부릅니다. */
  if (i + 1 < SERIES.length) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const next = 'https://' + host + '/api/cron?i=' + (i + 1);
    const headers = {};
    if (secret) headers.Authorization = 'Bearer ' + secret;
    else headers['User-Agent'] = 'vercel-cron/1.0';   /* 사슬도 같은 자격으로 */
    /* 요청이 나가는 것까지만 기다립니다. 그냥 던지기만 하면 응답을 보낸
       순간 함수가 얼어붙어 요청이 나가지도 못합니다. 답까지 기다리면
       6단계가 쌓여 상한을 넘기므로 3초에서 끊습니다. */
    const stopper = new AbortController();
    const cutTimer = setTimeout(() => stopper.abort(), 3000);
    try { await fetch(next, { headers, signal: stopper.signal }); } catch (e) {}
    clearTimeout(cutTimer);
    out.chain = 'i=' + (i + 1);
  } else {
    out.chain = 'done';
  }

  out.ms = Date.now() - t0;
  res.status(200).json(out);
}
