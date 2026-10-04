/* 내 PC 의 AI(Ollama)로 비어 있는 카드뉴스·자세한 설명문·목록 제목을 채웁니다.
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
         keyOf, deepIdOf, hotPicks, HOT_MAX, makeTitles, loadTitles, titleIdOf } from '../api/_lib.js';
import { SERIES, gather, otherFeeds, savePicks } from '../api/cron.js';

const OLLAMA = 'http://localhost:11434';
const MODEL = process.env.APEX_LOCAL_MODEL || 'gemma4:12b';
const LOG = join(process.env.LOCALAPPDATA || '.', 'apex-local-fill.log');
const log = m => {
  const line = new Date().toISOString() + ' ' + m;
  console.log(line);
  try { appendFileSync(LOG, line + '\n'); } catch (e) { /* 기록 실패는 넘어갑니다 */ }
};

/* Ollama 가 꺼져 있으면(PC 를 막 켰을 때 등) 조용히 끝냅니다 */
try {
  const r = await fetch(OLLAMA + '/api/version', { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
} catch (e) {
  log('Ollama 꺼져 있음 — 건너뜀');
  process.exit(0);
}

/* gemma4 는 답하기 전에 '생각'부터 길게 써서 글자 한도를 다 먹었습니다. 끕니다 */
useEngine({ url: OLLAMA + '/v1/chat/completions', models: [MODEL], callMs: 180000,
            body: { reasoning_effort: 'none' } });

const t0 = Date.now();
let cards = 0, deeps = 0, titles = 0;
const notes = [];

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
}

const sec = Math.round((Date.now() - t0) / 1000);
log('카드 ' + cards + ' · 풀이 ' + deeps + ' · 제목 ' + titles + ' · ' + sec + '초' + (notes.length ? ' · ' + notes.join(' / ') : ''));
/* 앱 밖에서도 PC 가 일했는지 볼 수 있게 서버 표에도 한 줄 */
await saveCards([{ id: '_run|pc', hook: 'PC 채우기', punch: (cards + '장·풀이' + deeps + '·제목' + titles).slice(0, 40),
                   line: (sec + '초 ' + notes.join(' ')).slice(0, 120), at: Date.now() }]);
