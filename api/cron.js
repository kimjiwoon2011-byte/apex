/* 정해진 시각에 저절로 돌면서 카드와 자세한 풀이를 미리 만들어 둡니다.
 *
 * 왜 필요한가 — 지금까지는 누군가 앱을 열어야 카드가 만들어졌습니다. 그래서
 * 새 기사가 올라온 뒤 처음 여는 사람은 20~30초를 기다려야 했고, 아무도 안
 * 열면 아예 안 만들어졌습니다. 미리 만들어 두면 열자마자 바로 보입니다.
 *
 * 한 번에 6개 부문을 줄줄이 하면 함수 상한(60초)을 넘깁니다. 그래서 i 없이
 * 불리면 지휘자가 되어 6개 부문을 한꺼번에 띄우고 다 끝날 때까지 지켜봅니다.
 * 나란히 도니까 제일 오래 걸리는 부문만큼만 기다리면 됩니다.
 */
import { makeCards, keyOf, loadExisting, saveCards,
         makeDeep, deepIdOf, loadDeep } from './_lib.js';

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

/* 눌렀을 때 나오는 자세한 풀이도 미리 만들어 둡니다.

   다 만들 수는 없습니다. 무료 한도가 하루 50회인데 6부문 × 10건이면
   60회입니다. 카드(6회)까지 더하면 66회라 한도를 넘습니다.

   그래서 부문마다 최신 3건까지만 미리 만듭니다. 6부문이면 18회,
   카드 6회를 더해 24회입니다. 나머지 26회는 사람이 눌러서 만들
   몫으로 남겨 둡니다. 미리 안 만들어진 기사를 눌러도 그 자리에서
   만들어지므로 안 나오는 일은 없습니다. */
const DEEP_PER_SERIES = 3;

/* 함수 상한이 60초입니다. 저장과 응답 몫을 남겨 54초에서 접습니다. */
const WORKER_MS = 54000;

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

    /* 돌았다는 사실 자체를 남깁니다.

       새 기사가 없는 날은 한 장도 안 만듭니다. 그러면 결과만 봐서는
       '만들 게 없어서 0장' 인지 '아예 안 돌아서 0장' 인지 가릴 수가
       없습니다. Vercel 무료 요금제는 실행 기록을 한 시간만 보관해서
       나중에 로그로 확인할 방법도 없습니다.

       카드 표에 한 줄 얹습니다. 앱은 'ko|<기사주소>' 로만 카드를 찾으므로
       이 줄은 화면에 나오지 않습니다. 표를 따로 만들지 않아도 됩니다. */
    const total = runs.reduce((n, r) => n + (r.made || 0), 0);
    const deepTotal = runs.reduce((n, r) => n + (r.deep || 0), 0);
    await saveCards([{
      id: '_run|cron',
      hook: '자동 갱신',
      punch: total + '장·풀이' + deepTotal,
      line: runs.map(r => r.series + ':' + (r.made || 0) + '+' + (r.deep || 0))
                .join(' ').slice(0, 120),
      at: Date.now(),
    }]);

    return res.status(200).json({ ran: new Date().toISOString(),
                                  made: total, deep: deepTotal, runs });
  }

  const i = Math.max(0, Math.min(SERIES.length - 1, parseInt(req.query.i, 10) || 0));
  const s = SERIES[i];
  const t0 = Date.now();
  const endAt = t0 + WORKER_MS;
  const out = { series: s.k, made: 0, cached: 0, deep: 0 };

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
      /* 카드가 먼저입니다. 다만 42초까지만 쓰게 해서 자세한 풀이 몫을
         남깁니다. 새 기사가 없는 날은 카드가 2초에 끝나므로 남는
         시간이 통째로 풀이에 갑니다. */
      const budget = Math.min(42000, endAt - Date.now());
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
    /* 자세한 풀이를 미리 만들어 둡니다. 한 건에 10초쯤 걸리므로 남는
       시간만큼만 합니다. 이미 있는 것은 건너뜁니다. */
    const have = await loadDeep(items.map(x => x.link));
    for (const it of items) {
      if (out.deep >= DEEP_PER_SERIES) break;
      if (endAt - Date.now() < 16000) break;      /* 한 건 할 시간이 없음 */
      if (have[deepIdOf(it.link)]) continue;      /* 이미 있음 */
      const d = await makeDeep(it, [], KEY,
                               Math.min(30000, endAt - Date.now() - 2000));
      if (d.reason === 'daily-limit') { out.note = 'daily-limit'; break; }
      if (!d.deep) continue;
      const n = await saveCards([{
        id: deepIdOf(it.link),
        hook: (d.deep.what || '').slice(0, 600),
        punch: (d.deep.why || '').slice(0, 400),
        line: (d.deep.note || '').slice(0, 400),
        at: Date.now(),
      }]);
      if (n) out.deep++;
    }
  } catch (e) {
    out.error = String(e).slice(0, 120);
  }

  /* 무엇을 했는지 한 줄 남깁니다. 이게 없으면 자동 갱신이 돌았는지,
     어느 부문에서 멈췄는지 나중에 알 방법이 없습니다. */
  console.log('cron ' + s.k + ' made=' + out.made + ' cached=' + out.cached + ' deep=' + out.deep
              + (out.note ? ' note=' + out.note : '')
              + (out.error ? ' error=' + out.error : ''));
  out.ms = Date.now() - t0;
  res.status(200).json(out);
}
