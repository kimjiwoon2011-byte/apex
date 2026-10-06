/* 시즌 순위표 — F1 은 Jolpica(옛 Ergast) API, 나머지 다섯 부문은 위키백과 시즌 문서.
 *
 * 왜 위키백과인가 — WEC·IMSA·DTM·SUPER GT·GT 월드 챌린지는 공개 API 가 없고, 공식
 * 사이트마다 생김새가 달라 따로따로 긁어야 합니다. 위키백과 시즌 문서는 경기 직후
 * 편집자들이 순위표를 고치고, 다섯 부문 모두 같은 틀(wikitable)이라 한 방식으로
 * 읽힙니다. 내용은 CC BY-SA 라 화면에 출처를 밝힙니다.
 *
 * 표는 칸 합치기(rowspan·colspan)가 많습니다. 제조사 순위는 차 두 대가 한 순위를
 * 나눠 쓰고(두 줄 합침), WEC 드라이버 순위는 표 안에 표가 들어 있습니다. 그래서
 * 칸을 격자로 펼친 뒤 'Pos.' 와 'Points' 머리글이 있는 표만 씁니다.
 */

const UA = { 'User-Agent': 'APEX-motorsport-app/1.0 (https://apex-five-theta.vercel.app)' };

const unent = s => String(s || '')
  .replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));

/* 칸 하나의 글자. 각주·숨은 정렬 글자·스타일은 뺍니다 */
const cellText = h => unent(String(h)
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<sup[\s\S]*?<\/sup>/g, '')
  .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/g, '')
  .replace(/<br\s*\/?>/g, ' / ')
  .replace(/<[^>]+>/g, ''))
  .replace(/\s+/g, ' ').trim();

/* 표 안의 표를 뺍니다 (바깥 표의 줄로 읽히지 않게) */
function dropNested(t) {
  let out = '', depth = 0, i = 0;
  const re = /<table\b|<\/table>/g;
  let m, last = 0;
  while ((m = re.exec(t))) {
    if (m[0] === '</table>') {
      if (depth === 1) last = m.index + 8;
      depth--;
    } else {
      if (depth === 0) out += t.slice(last, m.index);
      depth++;
    }
    i = re.lastIndex;
  }
  return out + t.slice(last);
}

/* 표 HTML → 칸을 펼친 격자 [[{t, th}]] */
function grid(tableHtml) {
  const body = dropNested(tableHtml.replace(/^<table[^>]*>/, ''));
  const rows = body.split(/<tr\b[^>]*>/).slice(1);
  const out = [], carry = [];          /* carry[c] = { left, cell } — 위 줄에서 내려오는 칸 */
  for (const r of rows) {
    const cells = [...r.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)(?=<t[hd]\b|<\/tr>|$)/g)];
    const line = [];
    let c = 0;
    const fill = () => { while (carry[c] && carry[c].left > 0) { line[c] = carry[c].cell; carry[c].left--; c++; } };
    for (const m of cells) {
      fill();
      const attrs = m[2];
      const rs = +((attrs.match(/rowspan="?(\d+)/) || [])[1] || 1);
      const cs = +((attrs.match(/colspan="?(\d+)/) || [])[1] || 1);
      const cell = { t: cellText(m[3]), th: m[1] === 'th' };
      for (let k = 0; k < cs; k++) {
        line[c] = cell;
        if (rs > 1) carry[c] = { left: rs - 1, cell };
        c++;
      }
    }
    fill();
    if (line.length) out.push(line);
  }
  return out;
}

/* 문서를 제목 경로와 표 목록으로 — [{ path:[h2,h3,...], html }] */
async function wikiTables(page) {
  const u = 'https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text|revid&redirects=1' +
            '&disableeditsection=1&disabletoc=1&page=' + encodeURIComponent(page);
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (!j.parse) throw new Error('위키백과 문서 없음: ' + page);
  const html = j.parse.text['*'];
  const out = [];
  const path = [];
  const re = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>|<table\b|<\/table>/g;
  let m, depth = 0, start = 0;
  while ((m = re.exec(html))) {
    if (m[1]) {                                         /* 제목 */
      if (depth) continue;
      const lv = +m[1];
      path.length = lv - 2;
      path[lv - 2] = cellText(m[2]);
    } else if (m[0] === '</table>') {
      depth--;
      if (depth === 0) out.push({ path: path.filter(Boolean), html: html.slice(start, m.index) });
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return { tables: out, rev: j.parse.revid };
}

/* 순위표 하나 → [{ p, n, sub, pts }] (순위·Points 머리글이 없으면 null).
   순위 칸 이름은 'Pos.' 이고 SUPER GT 문서만 'Rank' 입니다 */
const POS_HEAD = /^(Pos\.?|Rank)$/i;
function readStandings(tableHtml) {
  /* 바깥 감싸개 표면 안쪽 표들 중에서 찾습니다 */
  const g = grid(tableHtml);
  const head = g.find(row => row.some(c => c && POS_HEAD.test(c.t)) && row.some(c => c && /^(Points|Pts\.?)$/i.test(c.t)));
  if (!head) {
    const inner = tableHtml.replace(/^<table[^>]*>/, '').match(/<table\b[\s\S]*?<\/table>/g) || [];
    for (const t of inner) { const got = readStandings(t); if (got) return got; }
    return null;
  }
  const pos = head.findIndex(c => c && POS_HEAD.test(c.t));
  const pts = head.findIndex(c => c && /^(Points|Pts\.?)$/i.test(c.t));
  const name = pos + 1;
  const subHead = head[pos + 2] && head[pos + 2].t;
  const sub = /^(Team|Car|Entrant|Manufacturer|Make)$/i.test(subHead || '') ? pos + 2 : -1;
  const rows = [];
  for (const row of g) {
    const pc = row[pos], nc = row[name], ptc = row[pts];
    if (!pc || !nc || !ptc || row === head) continue;
    if (!/^(\d+|=\d+|DSQ|NC|EX|WD)$/i.test(pc.t)) continue;
    const v = parseFloat(String(ptc.t).replace(/[^\d.]/g, ''));
    const item = { p: pc.t, n: nc.t, sub: sub > 0 && row[sub] ? row[sub].t : '', pts: isNaN(v) ? 0 : v };
    const prev = rows[rows.length - 1];
    if (prev && prev.p === item.p && prev.n === item.n) continue;      /* 합친 칸이 다음 줄로 내려온 것 */
    rows.push(item);
  }
  return rows.length ? rows : null;
}

/* 같은 차를 나눠 탄 드라이버는 위키백과에서 한 사람씩 같은 순위로 나옵니다
   (WEC: 1 Buemi · 1 Hartley · 1 Hirakawa). 한 줄로 합칩니다.
   차 번호만 적힌 팀 순위(WEC LMGT3 '33' + 'TF Sport')는 '#33 TF Sport' 로 */
function tidy(rows, max = 30) {
  const out = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (prev && prev.p === r.p && prev.pts === r.pts && prev.sub === r.sub) { prev.n += ' / ' + r.n; continue; }
    out.push(/^\d+$/.test(r.n) && r.sub ? { p: r.p, n: '#' + r.n + ' ' + r.sub, sub: '', pts: r.pts } : { ...r });
  }
  return out.slice(0, max);
}

/* ── 부문마다 어느 문서의 어느 표를 쓸지 ──
   제목 경로(예: 'Championship standings › Drivers' Championships › Standings: … (GTP)')로
   고릅니다. cls 는 클래스(Hypercar·GT500 등), kind 는 drivers·teams·makers */
const kindOf = s => /Driver/i.test(s || '') ? 'drivers' : /Team/i.test(s || '') ? 'teams'
  : /Manufacturer/i.test(s || '') ? 'makers' : null;
const last = (p, k = 1) => p[p.length - k] || '';
const WIKI = {
  wec: [{ page: 'FIA World Endurance Championship', pick: p => {
    const cls = /Hypercar/.test(last(p)) ? 'Hypercar' : /LMGT3/.test(last(p)) ? 'LMGT3' : null;
    return cls && kindOf(last(p)) && { cls, kind: kindOf(last(p)) };
  } }],
  imsa: [{ page: 'IMSA SportsCar Championship', pick: p => {
    const m = last(p).match(/\(([^)]+)\)\s*$/);                 /* 'Standings: … (GTP)' */
    return m && /standings/i.test(p[0]) && kindOf(last(p, 2)) && { cls: m[1], kind: kindOf(last(p, 2)) };
  } }],
  dtm: [{ page: 'Deutsche Tourenwagen Masters', pick: p =>
    !/Rookie/i.test(last(p)) && kindOf(last(p)) && { cls: '', kind: kindOf(last(p)) } }],
  sgt: [{ page: 'Super GT Series', pick: p => {
    const c = p.find(x => /^GT(500|300)$/.test(x));
    return c && kindOf(last(p)) && { cls: c, kind: kindOf(last(p)) };
  } }],
  /* GT 월드 챌린지는 유럽·아메리카·아시아 셋. 클래스별 컵(골드·실버…)은 빼고 종합만 */
  gt: [
    { page: 'GT World Challenge Europe', pick: p =>
      last(p) === 'Overall' && kindOf(last(p, 2)) && { cls: 'Europe', kind: kindOf(last(p, 2)) } },
    { page: 'GT World Challenge America', pick: p =>
      p.length === 2 && kindOf(p[1]) && { cls: 'America', kind: kindOf(p[1]) } },
    { page: 'GT World Challenge Asia', pick: p => {
      const k = last(p) === 'Overall' ? kindOf(last(p, 2)) : /^Team/.test(last(p)) ? 'teams' : null;
      return k && { cls: 'Asia', kind: k };
    } },
  ],
};

/* 부문 하나 — 위키백과 문서들을 읽어 순위표 목록으로 */
/* 지난 시즌 문서로 넘어가는 건 새 시즌 문서가 아예 없을 때(시즌 초)만입니다.
   한때 잠깐 못 받은 것까지 넘겼더니 GT 유럽에 2025년 순위가 조용히 나왔습니다 */
async function seasonTables(name, year) {
  try { return { page: year + ' ' + name, got: await wikiTables(year + ' ' + name) }; }
  catch (e) {
    if (/문서 없음/.test(String(e))) return { page: (year - 1) + ' ' + name, got: await wikiTables((year - 1) + ' ' + name) };
    return { page: year + ' ' + name, got: await wikiTables(year + ' ' + name) };      /* 한 번 더 */
  }
}
async function wikiSeries(key, year) {
  const boards = [], src = [];
  const pages = await Promise.all(WIKI[key].map(s => seasonTables(s.page, year)));
  WIKI[key].forEach((s, i) => {
    const { page, got } = pages[i];
    src.push({ page, rev: got.rev });
    for (const t of got.tables) {
      const which = s.pick(t.path);
      if (!which || boards.some(b => b.cls === which.cls && b.kind === which.kind)) continue;
      const rows = readStandings(t.html);
      if (rows) boards.push({ ...which, rows: tidy(rows) });
    }
  });
  return { boards, src };
}

/* ── F1 — Jolpica (옛 Ergast) ──
   순위·연습/예선/스프린트 시각·포디움을 다 줍니다. 열쇠가 필요 없고 초당 4번까지 */
const JOLPICA = 'https://api.jolpi.ca/ergast/f1/';
async function jget(path) {
  const r = await fetch(JOLPICA + path, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Jolpica ' + r.status);
  return (await r.json()).MRData;
}
const at = x => x && x.date ? x.date + 'T' + (x.time || '00:00:00Z') : null;
async function f1(year) {
  /* 초당 4번 제한이라 셋씩 나눠 부릅니다 */
  const [ds, cs, sc] = await Promise.all([jget(year + '/driverstandings.json'),
    jget(year + '/constructorstandings.json'), jget(year + '.json')]);
  const pods = await Promise.all([1, 2, 3].map(n => jget(year + '/results/' + n + '.json?limit=100')));

  const dl = ds.StandingsTable.StandingsLists[0] || { DriverStandings: [], round: 0 };
  const cl = cs.StandingsTable.StandingsLists[0] || { ConstructorStandings: [] };
  const drivers = dl.DriverStandings.map(d => ({
    p: d.position || d.positionText, n: d.Driver.givenName + ' ' + d.Driver.familyName,
    code: d.Driver.code || '', fam: d.Driver.familyName,
    sub: (d.Constructors[0] || {}).name || '', pts: +d.points, wins: +d.wins }));
  const teams = cl.ConstructorStandings.map(c => ({
    p: c.position || c.positionText, n: c.Constructor.name, sub: '', pts: +c.points, wins: +c.wins }));

  /* 세션 시각 — [이름, UTC 시각] 순서대로 */
  const sessions = {};
  for (const r of sc.RaceTable.Races) {
    sessions[r.round] = [['FP1', at(r.FirstPractice)], ['FP2', at(r.SecondPractice)], ['FP3', at(r.ThirdPractice)],
      ['SQ', at(r.SprintQualifying)], ['SPRINT', at(r.Sprint)], ['Q', at(r.Qualifying)], ['RACE', at(r)]]
      .filter(x => x[1]).sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]));
  }
  /* 포디움 — 라운드마다 1·2·3위 '이름 (팀)' */
  const podium = {};
  pods.forEach((m, k) => m.RaceTable.Races.forEach(r => {
    const x = r.Results[0];
    if (!x) return;
    (podium[r.round] = podium[r.round] || [])[k] = x.Driver.givenName + ' ' + x.Driver.familyName + ' (' + x.Constructor.name + ')';
  }));
  return { after: +dl.round || 0,
           boards: [{ cls: '', kind: 'drivers', rows: drivers }, { cls: '', kind: 'teams', rows: teams }],
           sessions, podium, src: [{ page: 'Jolpica F1 API' }] };
}

/* 다섯 부문 + F1 을 한꺼번에. 한 부문이 실패해도 나머지는 돌려줍니다 */
export async function allStandings(year = new Date().getUTCFullYear()) {
  const out = { at: Date.now(), year, series: {} };
  const keys = Object.keys(WIKI);
  const res = await Promise.allSettled([f1(year), ...keys.map(k => wikiSeries(k, year))]);
  ['f1', ...keys].forEach((k, i) => {
    out.series[k] = res[i].status === 'fulfilled' ? res[i].value : { error: String(res[i].reason).slice(0, 120) };
  });
  return out;
}

export { wikiTables, readStandings, grid, cellText, UA };
