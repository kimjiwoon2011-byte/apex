/* 영어·일본어 카드·풀이를 저장하지 않고 몇 건만 만들어 봅니다 (확인용)
 * 돌리기  node tools/try-foreign.mjs [부문=f1] [건수=3] */
import { useEngine, makeCardsL, makeDeepL, articleText, hotPicks, HOT_MAX } from '../api/_lib.js';
import { SERIES, gather, otherFeeds } from '../api/cron.js';

useEngine({ url: 'http://localhost:11434/v1/chat/completions', models: [process.env.APEX_LOCAL_MODEL || 'gemma4:12b'],
            callMs: 180000, body: { reasoning_effort: 'none' } });

const k = process.argv[2] || 'f1', n = +(process.argv[3] || 3);
const s = SERIES.find(x => x.k === k);
const items = await gather(s);
const picks = hotPicks(items, await otherFeeds(s), HOT_MAX[k] || HOT_MAX.other).slice(0, n);
for (const lang of ['en', 'ja']) {
  const t0 = Date.now();
  const r = await makeCardsL(picks, lang, 300000);
  console.log('\n■ 카드', lang, (Date.now() - t0) + 'ms', r.cards ? '' : '실패 ' + (r.why || []).join('|'));
  (r.cards || []).forEach((c, i) => console.log('  ', picks[i].title.slice(0, 60), '\n     →', c ? `[${c.h}] [${c.p}] [${c.d}] (${c.h.length}/${c.p.length}/${c.d.length})` : '(버림)'));
}
const full = await articleText(picks[0].link).catch(() => '');
for (const lang of ['en', 'ja']) {
  const t0 = Date.now();
  const d = await makeDeepL(picks[0], lang, 300000, full);
  console.log('\n■ 풀이', lang, (Date.now() - t0) + 'ms', '원문', full ? full.length + '자' : '없음(도입부)');
  if (d.deep) for (const [key, v] of Object.entries(d.deep)) console.log('   ' + key + ' (' + v.length + '): ' + v);
  else console.log('   실패', (d.why || []).join('|'));
}
