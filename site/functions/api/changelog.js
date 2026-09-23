// GET /api/changelog: CHANGELOG.md from the repository, cached at the edge for
// 10 minutes. The site's timeline and "is there an update?" check read this, so
// they stay current with every release without redeploying the site, and
// visitors' browsers never talk to GitHub directly.
const SOURCE = 'https://raw.githubusercontent.com/rzrizaldy/quran-turn/main/CHANGELOG.md';

export async function onRequestGet() {
  const upstream = await fetch(SOURCE, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!upstream.ok) return new Response('changelog unavailable', { status: 502 });
  return new Response(await upstream.text(), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
}
