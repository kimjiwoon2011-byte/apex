/* 정해진 시각에 저절로 돌면서 카드를 미리 만들어 둡니다.
 *
 * 왜 필요한가 — 지금까지는 누군가 앱을 열어야 카드가 만들어졌습니다. 그래서
 * 새 기사가 올라온 뒤 처음 여는 사람은 20~30초를 기다려야 했고, 아무도 안
 * 열면 아예 안 만들어졌습니다. 미리 만들어 두면 열자마자 바로 보입니다.
 *
 * 한 번에 6개 부문을 줄줄이 하면 함수 상한(60초)을 넘깁니다. 그래서 i 없이
 * 불리면 지휘자가 되어 6개 부문을 한꺼번에 띄우고 다 끝날 때까지 지켜봅니다.
 * 나란히 도니까 제일 오래 걸리는 부문만큼만 기다리면 됩니다.
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

  /* 부를 자격은 정기 실행과 같은 것을 씁니다 */
  const callerHeaders = {};
  if (secret) callerHeaders.Authorization = 'Bearer ' + secret;
  else callerHeaders['User-Agent'] = 'vercel-cron/1.0';

  /* i 가 없으면 지휘자입니다. 6개 부문을 한꺼번에 띄우고 다 끝날 때까지
     지켜봅니다.

     예전에는 부문이 다음 부문을 부르는 사슬이었습니다. 그런데 부르는 쪽
     연결이 끊기면 받는 쪽 요청도 같이 중단됩니다. 사슬이 6겹으로 쌓이니
     맨 끝이 잘려 나갔고, 실제로 gt 부문이 한 번도 안 돌았습니다.

     한꺼번에 띄우면 겹치는 층이 하나뿐입니다. 지휘자가 끝까지 붙어
     있으므로 아무도 중간에 끊기지 않습니다. 부문끼리 나란히 도니까
     제일 오래 걸리는 부문만큼만 기다리면 됩니다. */
  if (req.query.i === undefined) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const runs = await Promise.all(SERIES.map((one, n) =>
      fetch('https://' + host + '/api/cron?i=' + n, { headers: callerHeaders })
        .then(r => r.json())
        .catch(e => ({ series: one.k, error: String(e).slice(0, 80) }))));
    console.log('cron 전체 · ' +
      runs.map(r => r.series + ' ' + (r.made || 0) + '장' +
                    (r.note ? '(' + r.note + ')' : '') +
                    (r.error ? '(' + r.error + ')' : '')).join(' · '));
    return res.status(200).json({ runs });
  }

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
      /* 남은 시간에서 저장 몫을 빼고 씁니다 */
      const budget = 50000 - (Date.now() - t0);
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
        out.note = made.reason;   /* daily-limit 이면 이 부문만 건너뜁니다 */
      }
    }
  } catch (e) {
    out.error = String(e).slice(0, 120);
  }

  /* 무엇을 했는지 한 줄 남깁니다. 이게 없으면 자동 갱신이 돌았는지,
     어느 부문에서 멈췄는지 나중에 알 방법이 없습니다. */
  console.log('cron ' + s.k + ' made=' + out.made + ' cached=' + out.cached
              + (out.note ? ' note=' + out.note : '')
              + (out.error ? ' error=' + out.error : ''));
  out.ms = Date.now() - t0;
  res.status(200).json(out);
}
