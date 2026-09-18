/* 앱이 부르는 "자세한 풀이" 만들기.
 *
 * 왜 서버인가 — 카드뉴스와 같은 이유입니다. 지금까지 이 기능은 기기에
 * OpenRouter 키가 들어 있어야만 돌았습니다. 그래서 휴대폰에서 카드를
 * 눌러도 짧은 도입부만 나왔습니다. 키를 Vercel 에 한 번 두면 어느
 * 기기에서 눌러도 나오고, 만든 글은 Supabase 에 쌓여 다음 사람은
 * 기다리지 않습니다.
 *
 * 원문을 읽어서 씁니다 — RSS 도입부는 200자뿐이라 그걸로 길게 쓰라고
 * 하면 지어내게 됩니다. 원문을 재료로 줘야 길이가 정직해집니다.
 * 원문을 그대로 보여주지는 않습니다. 우리말로 간추리고, 화면에는 늘
 * 출처와 원문 링크를 함께 답니다.
 *
 * 필요한 환경변수는 cards.js 와 같습니다 (OPENROUTER_KEY).
 */
import { makeDeep, deepIdOf, loadDeep, saveCards } from './_lib.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const KEY = process.env.OPENROUTER_KEY;
  if (!KEY) return res.status(500).json({ error: 'OPENROUTER_KEY 환경변수가 없습니다' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || !body.link || !body.title)
    return res.status(400).json({ error: 'link 와 title 이 필요합니다' });

  /* 남이 이 주소로 아무 글이나 밀어 넣지 못하게 길이를 제한합니다 */
  const item = {
    link: String(body.link).slice(0, 400),
    title: String(body.title).slice(0, 300),
    lead: String(body.lead || '').slice(0, 600),
  };
  const glossary = Array.isArray(body.glossary) ? body.glossary.slice(0, 40) : [];

  /* 이미 만들어 둔 게 있으면 그걸 줍니다 (AI 호출 0회) */
  const id = deepIdOf(item.link);
  const have = await loadDeep([item.link]);
  if (have[id] && have[id].what)
    return res.status(200).json({ deep: have[id], cached: true });

  const out = await makeDeep(item, glossary, KEY, 45000);
  if (!out.deep) return res.status(200).json({ deep: null, note: out.reason,
                                              raw: out.raw || '', why: out.why || [] });

  /* 표에 걸린 길이 제한 안으로 자릅니다. 넘기면 통째로 거절당하고,
     saveCards 는 조용히 0 을 돌려주므로 실패가 눈에 안 띕니다. */
  const saved = await saveCards([{
    id,
    hook: (out.deep.what || '').slice(0, 600),
    punch: (out.deep.why || '').slice(0, 400),
    line: (out.deep.note || '').slice(0, 400),
    at: Date.now(),
  }]);

  /* 저장 성공 여부를 숨기지 않습니다. 0 이면 다음 사람이 또 만들게 되므로
     그냥 넘어가면 안 되는 신호입니다 (표의 길이 제한을 늘려야 합니다). */
  res.status(200).json({ deep: out.deep, cached: false, saved: saved > 0,
                         model: out.model, full: !!out.usedFull });
}
