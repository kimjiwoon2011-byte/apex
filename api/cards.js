/* 앱이 부르는 카드 만들기.
 *
 * 왜 서버인가 — AI 키를 기기마다 넣어야 해서, 키를 안 넣은 휴대폰에서는
 * 카드가 하나도 안 보였습니다. 키를 Vercel 환경변수에 한 번 두면 어느
 * 기기에서 열든 서버가 만들어 주고, 만든 건 Supabase 에 쌓여 다음부터는
 * 아무도 다시 만들지 않습니다.
 *
 * 필요한 환경변수 (Vercel → Settings → Environment Variables)
 *   OPENROUTER_KEY   필수. openrouter.ai 키
 *   SUPABASE_URL     선택. 없으면 기본값
 *   SUPABASE_KEY     선택. 없으면 기본값 (publishable 키라 공개돼도 됩니다)
 *
 * 주의 — 키를 이 파일에 적지 마세요. 저장소가 공개라 그대로 남에게 넘어갑니다.
 */
import { makeCards, keyOf, loadExisting, saveCards, isPublisherLink } from './_lib.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const KEY = process.env.OPENROUTER_KEY;
  if (!KEY) return res.status(500).json({ error: 'OPENROUTER_KEY 환경변수가 없습니다' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const raw = (body && Array.isArray(body.items)) ? body.items.slice(0, 10) : null;
  const glossary = (body && Array.isArray(body.glossary)) ? body.glossary.slice(0, 40) : [];
  if (!raw || !raw.length)
    return res.status(400).json({ error: 'items 가 필요합니다 ([{link,title,lead}])' });

  /* 남이 이 주소로 아무 글이나 밀어 넣지 못하게 길이를 제한합니다 */
  const items = raw
    .filter(it => it && it.link && it.title && isPublisherLink(it.link))
    .map(it => ({ link: String(it.link).slice(0, 400),
                  title: String(it.title).slice(0, 300),
                  lead: String(it.lead || '').slice(0, 600) }));
  if (!items.length) return res.status(400).json({ error: 'items 형식이 잘못됐습니다' });

  /* 이미 서버에 있는 건 다시 만들지 않습니다 */
  const existing = await loadExisting(items.map(x => x.link));
  const todo = items.filter(it => !existing[keyOf(it.link)]);
  if (!todo.length)
    return res.status(200).json({ made: 0, cached: items.length, cards: existing });

  /* 5건씩 나눠 만들고 묶음마다 바로 저장합니다.
     10건을 한 번에 보내면 오후에 올라온 기사가 몰린 날 시간초과로 통째로
     실패했습니다. 그러면 앱을 연 사람은 카드를 하나도 못 봅니다.
     나눠 보내면 앞 묶음은 남고, 모자란 건 다음에 열 때 채워집니다. */
  const CHUNK = 5;
  const deadline = Date.now() + 52000;          /* 함수 상한 60초 안에서 */
  let saved = 0, model = '', note = '', why = [], modelRaw = '';
  for (let at = 0; at < todo.length; at += CHUNK) {
    /* 26초로 자르면 첫 모델이 느릴 때 2순위가 돌 시간이 없습니다 */
    const budget = deadline - Date.now() - 3000;
    if (budget < 12000) { note = note || '시간 모자람'; break; }
    const part = todo.slice(at, at + CHUNK);
    const out = await makeCards(part, glossary, KEY, budget);
    if (!out.cards) {
      note = out.reason; why = why.concat(out.why || []); modelRaw = out.raw || modelRaw;
      if (out.reason === 'daily-limit') break;  /* 더 해봐야 소용없습니다 */
      continue;
    }
    const rows = [];
    out.cards.forEach((c, i) => {
      if (!c || !c.p) return;
      const id = keyOf(part[i].link);
      existing[id] = c;
      rows.push({ id, hook: (c.h || '').slice(0, 40), punch: (c.p || '').slice(0, 40),
                  line: (c.d || '').slice(0, 120), at: Date.now() });
    });
    saved += await saveCards(rows);
    model = out.model;
  }

  res.status(200).json({ made: saved, cached: items.length - todo.length,
                         model, cards: existing,
                         ...(note ? { note, why, raw: modelRaw } : {}) });
}
