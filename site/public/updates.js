// The Update section and the Changelog timeline. Both are built from
// CHANGELOG.md (served by /api/changelog), so the site never goes stale.
// Everything is rendered with DOM nodes and textContent, never innerHTML.

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

// "**bold** and `code`" → nodes
function inline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? el('strong', {}, ...inline(m[1])) : el('code', { textContent: m[2] })); // bold may hold `code`
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// → [{ version, date, summary, items: [text] }], newest first
function parse(md) {
  const releases = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/);
    if (h) { cur = { version: h[1], date: h[2], summary: '', items: [] }; releases.push(cur); continue; }
    if (!cur || !line.trim()) continue;
    if (line.startsWith('- ')) cur.items.push(line.slice(2));
    else if (!cur.summary && !line.startsWith('#')) cur.summary = line.trim();
  }
  return releases;
}

const release = (r, i) => el('li', { className: 'tl-item' + (i === 0 ? ' latest' : '') },
    el('div', { className: 'tl-head' },
      el('span', { className: 'tl-version', textContent: `v${r.version}` }),
      i === 0 ? el('span', { className: 'tl-badge', textContent: 'Latest' }) : '',
      el('time', { className: 'tl-date', dateTime: r.date, textContent: new Date(r.date + 'T12:00:00Z').toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) })),
    r.summary ? el('p', { className: 'tl-summary' }, ...inline(r.summary)) : '',
    el('ul', { className: 'tl-list' }, ...r.items.map((t) => el('li', {}, ...inline(t)))),
  );

// The Changelog is folded; its header shows the latest version and summary.
function renderTimeline(releases) {
  $('timeline').replaceChildren(...releases.map(release));
  const [latest] = releases;
  $('changelog-ver').textContent = `Latest v${latest.version}`;
  $('changelog-ver').hidden = false;
  if (latest.summary) $('changelog-hint').textContent = latest.summary.replace(/\*\*|`/g, '');
}

function renderStatus(releases) {
  const latest = releases[0]?.version;
  const box = $('version-status');
  if (!latest || !box) return;
  const mine = new URLSearchParams(location.search).get('v');
  box.hidden = false;
  if (mine && VERSION_RE.test(mine)) {
    const behind = releases.filter((r) => cmp(r.version, mine) > 0);
    if (behind.length) {
      box.dataset.state = 'behind';
      box.replaceChildren(
        el('strong', { textContent: `You're on v${mine} · v${latest} is out` }),
        el('span', { textContent: ` · ${behind.length} update${behind.length === 1 ? '' : 's'} since yours. Follow the steps below; Codex also needs trusted hooks before the reader opens.` }));
    } else {
      box.dataset.state = 'current';
      box.replaceChildren(el('strong', { textContent: `You're up to date · v${mine}` }), el('span', { textContent: ' · nothing to do.' }));
    }
  } else {
    box.dataset.state = 'info';
    box.replaceChildren(el('strong', { textContent: `Latest version: v${latest}` }));
  }
}

async function init() {
  try {
    const res = await fetch('/api/changelog');
    if (!res.ok) throw new Error(String(res.status));
    const releases = parse(await res.text());
    if (!releases.length) throw new Error('empty');
    renderTimeline(releases);
    renderStatus(releases);
  } catch {
    $('timeline').replaceChildren(el('li', { className: 'tl-fallback' },
      'The changelog couldn’t load right now. ',
      el('a', { href: 'https://github.com/rzrizaldy/quran-turn/blob/main/CHANGELOG.md', textContent: 'Read it on GitHub →' })));
  }
}

// The nav's "Changelog" link opens the folded timeline.
function openFromHash() {
  if (location.hash === '#changelog') $('changelog').open = true;
}
addEventListener('hashchange', openFromHash);
openFromHash();

init();
