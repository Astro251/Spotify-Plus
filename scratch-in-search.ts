const BASE = 'https://music.youtube.com/youtubei/v1';
const KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function* walk(o: any): Generator<any> {
  if (o && typeof o === 'object' && !Array.isArray(o)) { yield o; for (const v of Object.values(o)) yield* walk(v); }
  else if (Array.isArray(o)) for (const v of o) yield* walk(v);
}

async function search(query: string, params?: string) {
  const res = await fetch(`${BASE}/search?key=${KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240401.01.00', hl: 'en', gl: 'US' } },
      query, ...(params ? { params } : {}),
    }),
  });
  return res.json();
}

async function main() {
  for (const q of ['bollywood hits', 'punjabi hits', 'indian indie']) {
    const d: any = await search(q, 'EgWKAQIoAWoKEAkQChAFEAMQBA%3D%3D'); // playlists filter
    let found = 0;
    for (const dict of walk(d)) {
      if (dict.musicShelfRenderer) {
        for (const c of dict.musicShelfRenderer.contents ?? []) {
          const li = c.musicResponsiveListItemRenderer;
          if (!li) continue;
          const be = li.navigationEndpoint?.browseEndpoint?.browseId;
          const title = li.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const thumb = (() => { for (const dd of walk(li)) { if (dd.thumbnails) return dd.thumbnails?.[0]?.url; } })();
          if (be && /^(VL|PL|RD)/.test(be) && found < 5) {
            found++;
            console.log(`  [${q}] ${title} | ${be} | ${thumb ? 'thumb✓' : 'no-thumb'}`);
          }
        }
      }
    }
    if (!found) console.log(`  [${q}] NO PLAYLIST RESULTS via shelf; trying unfiltered next`);
  }
}
main().catch(console.error);
