/* 내 PC 의 AI(Ollama)로 비어 있는 카드뉴스·자세한 설명문·목록 제목을 채우고,
 * 영어로 남은 이름의 한글 표기를 배웁니다.
 *
 * 서버의 자동 갱신(2시간마다, 무료 AI 하루 50번)은 그대로 돌고, 이건 PC 가 켜져
 * 있을 때 돌아서 그 사이에 올라온 기사를 채웁니다. PC 의 AI 는 한도가 없어서
 * 설명문까지 모든 기사에 만듭니다. 같은 표(Supabase)에 쓰므로 앱은 바꿀 게 없고,
 * 서버와 PC 중 먼저 만든 쪽이 쓰입니다.
 *
 * 2026-10-02 같은 기사로 재 본 결과 (서버 1순위 ling-flash 와 비교)
 *   카드 5장  9초 5/5 · 서버가 붐벼서 못 만든 IMSA 5장 중 4장
 *   설명문    12초 (원문 읽기 포함), 숫자·순위가 원문과 맞음
 *
 * 돌리기     node tools/local-fill.mjs
 * 필요한 것  Ollama + gemma4:12b  (ollama pull gemma4:12b)
 * 기록       %LOCALAPPDATA%\apex-local-fill.log, 그리고 Supabase 의 '_run|pc' 줄
 */
import { appendFileSync } from 'fs';
import { join } from 'path';
import { useEngine, makeCards, makeDeep, loadExisting, loadDeep, saveCards,
         keyOf, deepIdOf, hotPicks, HOT_MAX, makeTitles, loadTitles, titleIdOf,
         leftoverNames, sourceNames, decidedNames, learnNames } from '../api/_lib.js';
import { SERIES, gather, otherFeeds, savePicks } from '../api/cron.js';

const OLLAMA = 'http://localhost:11434';
const MODEL = process.env.APEX_LOCAL_MODEL || 'gemma4:12b';
const LOG = join(process.env.LOCALAPPDATA || '.', 'apex-local-fill.log');
const log = m => {
  const line = new Date().toISOString() + ' ' + m;
  console.log(line);
  try { appendFileSync(LOG, line + '\n'); } catch (e) { /* 기록 실패는 넘어갑니다 */ }
};

/* Ollama 가 뜰 때까지 3분까지 기다립니다. PC 를 켜면 로그인 3분 뒤에 도는데,
   그때 Ollama 가 아직 안 떠 있으면 바로 끝나 다음 정각까지 한 시간을 그냥
   보냈습니다 (10/3 03:47). 3분이 지나도 없으면 꺼 둔 것으로 보고 끝냅니다 */
let up = false;
for (let i = 0; i < 18 && !up; i++) {
  try {
    const r = await fetch(OLLAMA + '/api/version', { signal: AbortSignal.timeout(3000) });
    up = r.ok;
  } catch (e) { /* 아직 안 뜸 */ }
  if (!up) await new Promise(r => setTimeout(r, 10000));
}
if (!up) {
  log('Ollama 꺼져 있음 — 건너뜀');
  process.exit(0);
}

/* gemma4 는 답하기 전에 '생각'부터 길게 써서 글자 한도를 다 먹었습니다. 끕니다 */
useEngine({ url: OLLAMA + '/v1/chat/completions', models: [MODEL], callMs: 180000,
            body: { reasoning_effort: 'none' } });

const t0 = Date.now();
let cards = 0, deeps = 0, titles = 0;
const notes = [];
const cand = new Map();          /* 영어로 남은 이름 → 나온 기사 제목 */

for (const s of SERIES) {
  let items = [];
  try { items = await gather(s); } catch (e) { /* 아래에서 기사 없음으로 */ }
  if (!items.length) { notes.push(s.k + ':기사없음'); continue; }

  /* 서버와 같은 기준으로 화제성 있는 기사만 고릅니다. PC 는 1시간마다 돌아서
     고른 목록도 더 자주 새로 고칩니다 */
  const picks = hotPicks(items, await otherFeeds(s), HOT_MAX[s.k] || HOT_MAX.other);
  await savePicks(s, picks);

  /* 카드 — 서버와 같이 5건씩 */
  const have = await loadExisting(picks.map(x => x.link));
  const todo = picks.filter(x => !have[keyOf(x.link)]);
  for (let i = 0; i < todo.length; i += 5) {
    const part = todo.slice(i, i + 5);
    const r = await makeCards(part, [], '', 600000);
    if (!r.cards) { notes.push(s.k + ':카드실패 ' + (r.why || []).join('|')); continue; }
    const rows = [];
    r.cards.forEach((c, n) => {
      if (!c || !c.p) return;
      rows.push({ id: keyOf(part[n].link), hook: (c.h || '').slice(0, 40),
                  punch: c.p.slice(0, 40), line: (c.d || '').slice(0, 120), at: Date.now() });
    });
    cards += await saveCards(rows);
  }

  /* 목록 제목 — 아직 안 옮긴 것과 서버가 옮긴 것을 한 번에.
     서버 무료 AI(ling-flash)는 20건을 한꺼번에 받으면 가끔 다른 기사의 따옴표 말을
     섞거나 이름을 지어냈습니다(10/3, 40건 중 3건). PC 의 AI 가 더 정확해서 다시 옮깁니다 */
  const named = await loadTitles(items.map(x => x.link));
  const bare = items.filter(x => { const g = named[titleIdOf(x.link)]; return !g || g.by !== 'pc'; });
  if (bare.length) {
    const r = await makeTitles(bare, '', 600000);
    if (!r.titles) notes.push(s.k + ':제목실패');
    else titles += await saveCards(r.titles.map((v, n) => v && {
      id: titleIdOf(bare[n].link), hook: '', punch: 'pc', line: v.slice(0, 120), at: Date.now() }).filter(Boolean));
  }

  /* 설명문 — 한 건씩. 묶으면 기사끼리 섞일 수 있고, PC 는 한도가 없어 묶을 이유가 없습니다 */
  const done = await loadDeep(picks.map(x => x.link));
  for (const it of picks.filter(x => !done[deepIdOf(x.link)])) {
    const d = await makeDeep(it, [], '', 600000);
    if (!d.deep) { notes.push(s.k + ':풀이실패'); continue; }
    deeps += await saveCards([{
      id: deepIdOf(it.link),
      hook: d.deep.what.slice(0, 600),
      punch: (d.deep.why || '').slice(0, 400),
      line: (d.deep.note || '').slice(0, 400),
      at: Date.now(),
    }]);
  }

  /* 카드·목록 제목·풀이에 영어로 남은 이름을 모읍니다 (아래에서 한꺼번에 배웁니다) */
  const links = items.map(x => x.link);
  const [cs, ts, ds] = await Promise.all([loadExisting(links), loadTitles(links), loadDeep(links)]);
  for (const it of items) {
    const c = cs[keyOf(it.link)], t = ts[titleIdOf(it.link)], d = ds[deepIdOf(it.link)];
    const ko = [c && [c.h, c.p, c.d].join(' '), t && t.t, d && [d.what, d.why, d.note].join(' ')]
      .filter(Boolean).join(' ');
    for (const w of leftoverNames(ko)) if (!cand.has(w)) cand.set(w, it.title.slice(0, 100));
    /* 영어 원문의 이름도 — 구글 번역 도입부에 영어로 남는 이름 (독일어·일본어 원문은 뺌) */
    if (!/de\.motorsport|jp\.motorsport/.test(it.link))
      for (const w of sourceNames(it.title, it.lead)) if (!cand.has(w)) cand.set(w, it.title.slice(0, 100));
  }
}

/* 이름 배우기 — 이름표에 없어 영어로 남은 이름의 한글 표기를 정해 서버 표에 남깁니다.
   서버와 앱이 그 표를 같이 쓰므로, 다음 카드부터 한글로 나오고 이미 만든 카드도
   화면에서 바뀝니다. 이미 정한 말은 건너뜁니다. 하루 최대 200개.
   한 번에 10개씩 — 40개씩 물었더니 답이 옆 줄로 밀려 엉뚱한 표기가 붙었습니다 */
const decided = await decidedNames();
const ask = [...cand].filter(([w]) => !decided.has(w)).slice(0, 200).map(([w, ctx]) => ({ w, ctx }));
const learned = [];
for (let i = 0; i < ask.length; i += 10) {
  const rows = await learnNames(ask.slice(i, i + 10), '', 600000);
  if (!rows.length) { notes.push('이름배우기실패'); continue; }
  learned.push(...rows.filter(r => r.punch));
}
if (learned.length) log('배운 이름 ' + learned.length + ': ' + learned.map(r => r.hook + '=' + r.punch).join(', '));

const sec = Math.round((Date.now() - t0) / 1000);
log('카드 ' + cards + ' · 풀이 ' + deeps + ' · 제목 ' + titles + ' · 이름 ' + learned.length + ' · ' + sec + '초' + (notes.length ? ' · ' + notes.join(' / ') : ''));
/* 앱 밖에서도 PC 가 일했는지 볼 수 있게 서버 표에도 한 줄 */
await saveCards([{ id: '_run|pc', hook: 'PC 채우기', punch: (cards + '장·풀이' + deeps + '·제목' + titles + '·이름' + learned.length).slice(0, 40),
                   line: (sec + '초 ' + notes.join(' ')).slice(0, 120), at: Date.now() }]);
