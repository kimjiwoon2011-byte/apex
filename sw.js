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
const VER = 'apex-2026-09-25f';
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
    /* 받기는 끝까지 하고, 다 오면 담아 둡니다.

       예전에는 3초에서 받기를 끊었습니다. 그러면 통신이 느린 폰(앱 화면이
       400KB 입니다)은 새 버전을 한 번도 못 담아서, 몇 번을 열어도 옛 화면만
       떴습니다 — "배포가 안 된 것 같다". 이제 이번엔 옛 화면이어도 뒤에서 새
       버전을 끝까지 받아 두고, 정말 바뀌었으면 화면에 알려 줍니다. */
    const stale = { hit: null };
    const net = fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        return caches.open(SHELL).then(c => c.put(req, copy)).then(() => res, () => res);
      }
      return res;
    });
    const clientId = e.resultingClientId || e.clientId;
    e.waitUntil(net.then(async fresh => {
      if (!stale.hit || !fresh || !fresh.ok) return;          /* 새것을 바로 보여 줬음 */
      const was = stale.hit.headers.get('etag'), now = fresh.headers.get('etag');
      if (!was || !now || was === now) return;                /* 바뀐 게 없음 */
      const c = clientId && await self.clients.get(clientId);
      if (c) c.postMessage({ type: 'apex-updated' });
    }).catch(() => {}));

    e.respondWith((async () => {
      const slow = new Promise(r => setTimeout(() => r(null), 3000));
      let res = null;
      try { res = await Promise.race([net, slow]); } catch (err) { /* 통신이 안 됩니다 */ }
      if (res && res.ok) return res;
      const hit = (await caches.match(req)) || (await caches.match('/'));
      if (!hit) {
        try { return await net; } catch (err) { return Response.error(); }   /* 늦더라도 새것을 */
      }
      if (res === null) stale.hit = hit;      /* 느려서 옛 화면을 먼저 보여 줌 */
      return hit;
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
