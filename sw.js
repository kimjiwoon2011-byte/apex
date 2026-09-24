/* 앱을 기기에 담아 두는 일꾼(service worker).
 *
 * 왜 필요한가 — 홈 화면에 추가해도 통신이 안 되면 빈 화면이 떴습니다.
 * 앱 껍데기를 담아 두면 지하철이나 전파가 약한 곳에서도 열립니다.
 *
 * 규칙을 둘로 나눴습니다.
 *   앱 화면(HTML)  항상 새로 받습니다. 3초 안에 안 오면 담아 둔 것으로.
 *                   (옛 화면이 뜨면 고친 것이 안 보입니다)
 *   아이콘·일정     담아 둔 것을 먼저 보여 주고, 뒤에서 새것을 받아 둡니다.
 *   소식·번역·서버   항상 새로 받습니다. 안 되면 담아 둔 것으로 대신합니다.
 *                   (오래된 소식을 보여 주느니 안 보여 주는 게 낫습니다)
 */
const VER = 'apex-2026-09-24b';
const SHELL = VER + '-shell';
const DATA  = VER + '-data';

/* 앱을 열기 위해 반드시 있어야 하는 것들 */
const CORE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/races.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())    /* 하나 실패해도 설치는 진행 */
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 담아 두면 안 되는 것 — 로그인, 서버 쓰기, AI 호출 */
function skip(url) {
  return url.pathname.startsWith('/api/cards')
      || url.pathname.startsWith('/api/cron')
      || url.hostname.endsWith('supabase.co')
      || url.hostname === 'openrouter.ai';
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (skip(url)) return;                      /* 손대지 않고 그대로 통과 */

  /* 소식·번역은 새것이 먼저 */
  const fresh = url.pathname.startsWith('/api/');
  if (fresh) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(DATA).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))       /* 안 되면 담아 둔 것 */
    );
    return;
  }

  /* 앱 화면(HTML)은 새것이 먼저입니다.

     담아 둔 것을 먼저 내주면 고친 내용이 폰에 닿으려면 앱을 두 번 열어야
     합니다. 구글 로그인에서 돌아오는 것도 새 페이지 이동이라, 돌아올
     때마다 옛 화면이 떴습니다. 그래서 지운 부문이 되살아나고, 카드와
     자세한 풀이가 안 붙는 것처럼 보였습니다.

     통신이 느릴 때를 위해 3초만 기다리고, 안 되면 담아 둔 것으로 넘어갑니다.
     지하철에서도 앱이 열리는 것은 그대로입니다. */
  const isPage = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    e.respondWith((async () => {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 3000);
        let res;
        try { res = await fetch(req, { signal: ctl.signal }); }
        finally { clearTimeout(timer); }
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {});
          return res;
        }
      } catch (err) { /* 통신이 안 되거나 너무 느립니다 */ }
      return (await caches.match(req)) || (await caches.match('/')) || Response.error();
    })());
    return;
  }

  /* 앱 파일은 담아 둔 것이 먼저, 새것은 뒤에서 받아 둡니다 */
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(res => {
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);                    /* 통신 안 되면 담아 둔 것 */
      return hit || net;
    })
  );
});
