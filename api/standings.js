/* 모든 부문의 시즌 순위 + F1 세션 시각·포디움 (api/_standings.js)
 *
 * 앱이 열릴 때마다 위키백과·Jolpica 를 부르면 그쪽에 짐이 되므로, Vercel 이 응답을
 * 6시간 동안 저장해 두고 그 사이에는 저장본을 돌려줍니다. 6시간이 지나면 저장본을
 * 먼저 돌려주고 뒤에서 새로 받아 둡니다(stale-while-revalidate). */
import { allStandings } from './_standings.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  try {
    const out = await allStandings();
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: String(e).slice(0, 160) });
  }
}
