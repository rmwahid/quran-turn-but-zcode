// Quran Turn reader. Ayah strings only ever reach the page through textContent
// and are never altered; the file is checked against its pinned SHA-256 first.
import { QURAN_SHA256, SITE_URL, SUPPORT_URL, VERSION } from './config.js';
import { arabicDigits, parseTanzil, sha256Hex, splitBasmala } from './quran-core.js';
import { FloatCard, canFloat } from './float.js';

const $ = (id) => document.getElementById(id);
const meta = window.QuranData;
const counts = meta.Sura.map((s) => s[1] ?? 0);
const AGENT_NAMES = { claude: 'Claude', codex: 'Codex' };

let quran = null;
let pos = { surah: 1, ayah: 1 };
let agent = { status: 'idle' };
let canSwitch = false;
let saving = Promise.resolve();
let pendingSaves = 0;
let doneTimer = null;
let floating = false;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ── Text ────────────────────────────────────────────────────────────────────

async function loadText() {
  const res = await fetch('/data/quran-uthmani.txt', { cache: 'no-cache' });
  if (!res.ok) throw new Error('The Qur’an text file could not be loaded.');
  const bytes = await res.arrayBuffer();
  if ((await sha256Hex(bytes)) !== QURAN_SHA256) {
    throw new Error('The Qur’an text on disk does not match its pinned checksum, so nothing is shown. Reinstall quran-turn, or run npm run verify to see what changed.');
  }
  return parseTanzil(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

// Writes one ayah into `el` (main reader or float card) through textContent only,
// then checks the element reads back exactly the source string.
function fillAyah(el, surah, ayah) {
  const text = quran.bySurah[surah][ayah - 1];
  const split = splitBasmala(surah, ayah, text, quran.verses.get('1:1'));
  const doc = el.ownerDocument;
  if (split) {
    const b = doc.createElement('span');
    b.className = 'basmala';
    b.textContent = split.basmala;
    el.replaceChildren(b, doc.createTextNode(' ' + split.rest));
  } else {
    el.textContent = text;
  }
  if (el.textContent !== text) throw new Error(`Rendering check failed at ${surah}:${ayah}.`);
}

function renderAyah() {
  const { surah, ayah } = pos;
  try {
    fillAyah($('ayah-text'), surah, ayah);
  } catch (err) {
    return fail(err);
  }
  $('ayah-end').textContent = '\u06DD' + arabicDigits(ayah);
  $('surah-ar').textContent = meta.Sura[surah][4];
  $('surah-ref').textContent = `${meta.Sura[surah][5].toUpperCase()} · ${surah}:${ayah}`;
  document.title = `${surah}:${ayah} · Quran Turn`;
  $('stage').scrollTop = 0;
  renderFloat();
}

function fail(err) {
  quran = null;
  $('ayah-text').replaceChildren();
  $('ayah-end').textContent = '';
  $('error').textContent = err.message;
  $('error').hidden = false;
  $('verified').hidden = true;
  for (const id of ['next', 'prev', 'open-jump']) $(id).disabled = true;
}

// ── Agent status ────────────────────────────────────────────────────────────

function renderStatus() {
  const name = AGENT_NAMES[agent.agent] || 'Agent';
  const status = agent.status || 'idle';
  const el = $('status');
  el.dataset.status = status;
  $('status-text').textContent =
    status === 'working' ? `${name} is working` : status === 'needs_you' ? 'Paused' : 'Idle';

  const banner = $('banner');
  const back = $('back-btn');
  back.textContent = `Back to ${name}`;
  back.title = 'Space';
  back.setAttribute('aria-keyshortcuts', 'Space');
  back.hidden = !canSwitch;
  // Only advertise Space when it really goes back (see agentWaiting).
  $('back-hint').hidden = !(canSwitch && (status === 'needs_you' || (status === 'done' && isCompact())));
  clearTimeout(doneTimer);
  if (status === 'needs_you') {
    banner.dataset.kind = 'needs_you';
    $('banner-title').textContent = `${name} needs you`;
    $('banner-meta').textContent = canSwitch ? 'permission requested · reading paused' : 'permission requested · go back to your terminal';
    banner.hidden = false;
  } else if (status === 'done' && agent.last_turn && !banner.dataset.dismissed) {
    const t = agent.last_turn;
    banner.dataset.kind = 'done';
    $('banner-title').textContent = `Saved at ${t.to}`;
    $('banner-meta').textContent = `turn finished · ${t.from} → ${t.to} · ${t.ayat} ${t.ayat === 1 ? 'ayah' : 'ayat'}`;
    banner.hidden = false;
    doneTimer = setTimeout(() => { banner.hidden = true; banner.dataset.dismissed = '1'; }, 60_000);
  } else {
    banner.hidden = true;
    banner.dataset.kind = 'idle';
    $('banner-title').textContent = floating ? 'Reading in the floating card' : `Saved at ${pos.surah}:${pos.ayah}`;
    $('banner-meta').textContent = floating ? 'close the card to come back here' : 'reading continues on your next prompt';
  }
  if (status === 'working') delete banner.dataset.dismissed;

  const n = agent.ayat || 0;
  const ayat = `${n} ${n === 1 ? 'ayah' : 'ayat'}`;
  $('counter').textContent =
    status === 'working' ? `${ayat} this turn`
    : status === 'needs_you' ? `${ayat} · paused`
    : agent.last_turn ? `Last turn: ${agent.last_turn.from} → ${agent.last_turn.to}`
    : 'Go to · g';
  renderFloat();
}

// ── Float mode ──────────────────────────────────────────────────────────────

const card = new FloatCard({
  onKey: (ev) => floatKey(ev),
  onBack: () => backToAgent(),
  onClose: () => setFloating(false),
});

function renderFloat() {
  if (!card.open || !quran) return;
  const name = AGENT_NAMES[agent.agent] || 'Agent';
  const status = agent.status || 'idle';
  const n = agent.ayat || 0;
  const t = agent.last_turn;
  try {
    card.render({
      fill: (el) => fillAyah(el, pos.surah, pos.ayah),
      surah: pos.surah,
      ayah: pos.ayah,
      end: '\u06DD' + arabicDigits(pos.ayah),
      ref: `${meta.Sura[pos.surah][5].toUpperCase()} · ${pos.surah}:${pos.ayah}`,
      status,
      statusText: status === 'working' ? `${name} is working` : status === 'needs_you' ? 'Paused' : 'Idle',
      name,
      canSwitch,
      counter: status === 'working' || status === 'needs_you' ? `${n} ${n === 1 ? 'ayah' : 'ayat'} this turn` : `${pos.surah}:${pos.ayah}`,
      doneId: t?.ended_at || null,
      doneTitle: t ? `Saved at ${t.to} · ${t.ayat} ${t.ayat === 1 ? 'ayah' : 'ayat'}` : '',
    });
  } catch (err) {
    card.close();
    fail(err);
  }
}

function floatKey(ev) {
  const k = ev.key;
  if (k === 'ArrowLeft' || k === 'j' || k === ' ') { ev.preventDefault(); step(1); }
  else if (k === 'ArrowRight' || k === 'k') { ev.preventDefault(); step(-1); }
}

function setFloating(on) {
  floating = on;
  store.set('quran-turn:float', on ? '1' : '0');
  fetch('/api/float', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) }).catch(() => {});
  renderStatus();
}

async function startFloat() {
  if (!quran || !canFloat()) return;
  try {
    await card.show();
  } catch (err) {
    console.warn('quran-turn: could not open the float card:', err?.name, err?.message);
    return; // no user gesture, or the browser refused
  }
  setFloating(true);
}

// ── Position ────────────────────────────────────────────────────────────────

function go(next) {
  if (!quran) return;
  pos = { surah: next.surah, ayah: next.ayah };
  renderAyah();
  store.set('quran-turn:position', JSON.stringify(pos));
  pendingSaves++;
  // Serialize saves so the server sees moves in order (it counts "next ayah" steps).
  const body = JSON.stringify(pos);
  saving = saving
    .then(() => fetch('/api/position', { method: 'POST', headers: { 'content-type': 'application/json' }, body }))
    .then((r) => (r.ok ? r.json() : null))
    .then((snap) => { if (snap) { agent = snap.agent; canSwitch = Boolean(snap.canSwitch); renderStatus(); } })
    .catch(() => {})
    .finally(() => { pendingSaves--; });
}

function step(delta) {
  let { surah, ayah } = pos;
  ayah += delta;
  if (ayah > counts[surah]) { surah = (surah % 114) + 1; ayah = 1; }
  else if (ayah < 1) { surah = surah === 1 ? 114 : surah - 1; ayah = counts[surah]; }
  go({ surah, ayah });
}

function valid(p) {
  return p && Number.isInteger(p.surah) && p.surah >= 1 && p.surah <= 114 &&
    Number.isInteger(p.ayah) && p.ayah >= 1 && p.ayah <= counts[p.surah];
}

// ── Go-to sheet ─────────────────────────────────────────────────────────────

function buildSurahList() {
  const list = $('surah-list');
  for (let s = 1; s <= 114; s++) {
    const [, ayas, , , ar, tr, en] = meta.Sura[s];
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.surah = s;
    b.dataset.search = `${s} ${tr} ${en} ${ar}`.toLowerCase().replace(/[-'’]/g, '');
    const num = Object.assign(document.createElement('span'), { className: 'surah-num', textContent: s });
    const names = Object.assign(document.createElement('span'), { className: 'surah-names' });
    names.append(
      Object.assign(document.createElement('span'), { className: 'surah-tr', textContent: tr }),
      Object.assign(document.createElement('span'), { className: 'surah-en', textContent: `${en} · ${ayas} ayat` }),
    );
    const arEl = Object.assign(document.createElement('span'), { className: 'surah-ar', textContent: ar });
    arEl.lang = 'ar';
    arEl.dir = 'rtl';
    b.append(num, names, arEl);
    b.addEventListener('click', () => { closeJump(); go({ surah: s, ayah: 1 }); });
    li.append(b);
    list.append(li);
  }
}

function openJump() {
  if (!quran) return;
  $('jump').hidden = false;
  for (const b of $('surah-list').querySelectorAll('button')) {
    b.setAttribute('aria-current', String(Number(b.dataset.surah) === pos.surah));
  }
  $('jump-search').value = '';
  $('jump-ref').value = '';
  filterSurahs();
  $('jump-search').focus();
  $('surah-list').querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
}

function closeJump() {
  $('jump').hidden = true;
  $('open-jump').focus();
}

function filterSurahs() {
  const q = $('jump-search').value.trim().toLowerCase().replace(/[-'’]/g, '');
  for (const b of $('surah-list').querySelectorAll('button')) {
    b.parentElement.hidden = q !== '' && !(b.dataset.surah === q || b.dataset.search.includes(q));
  }
}

function submitJump(e) {
  e.preventDefault();
  const ref = $('jump-ref').value.trim();
  if (ref) {
    const m = ref.match(/^(\d{1,3})(?:\s*[:.\s]\s*(\d{1,3}))?$/);
    const p = m && { surah: Number(m[1]), ayah: Number(m[2] || 1) };
    if (!valid(p)) { $('jump-ref').setAttribute('aria-invalid', 'true'); return; }
    $('jump-ref').removeAttribute('aria-invalid');
    closeJump();
    return go(p);
  }
  const first = [...$('surah-list').querySelectorAll('li:not([hidden]) button')][0];
  if (first) first.click();
}

// ── Preferences ─────────────────────────────────────────────────────────────

function setSize(px) {
  const size = Math.min(48, Math.max(20, px));
  document.documentElement.style.setProperty('--ayah-size', `${size}px`);
  store.set('quran-turn:size', String(size));
}
const currentSize = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ayah-size'), 10) || 30;

function toggleTheme() {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  store.set('quran-turn:theme', document.documentElement.dataset.theme);
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function backToAgent() {
  fetch('/api/back-to-agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
}

// The window is collapsed to the small strip (see the compact media query).
const isCompact = () => window.innerHeight < 180;
// Space/Enter jumps back to the agent while it waits on you, or from the strip
// after a turn. Once you "Open" the reader again after a turn, Space reads on.
const agentWaiting = () => canSwitch && (agent.status === 'needs_you' || (agent.status === 'done' && isCompact()));

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$('jump').hidden) {
    if (e.key === 'Escape') closeJump();
    return;
  }
  const k = e.key;
  if ((k === ' ' || k === 'Enter') && agentWaiting() && !e.target.closest?.('button, a, input')) {
    e.preventDefault();
    return backToAgent();
  }
  // In the strip the ayah isn't visible, so don't move it.
  if (isCompact()) return;
  // Arabic reads right-to-left, so ← moves forward.
  if (k === 'ArrowLeft' || k === 'j' || k === ' ') { e.preventDefault(); step(1); }
  else if (k === 'ArrowRight' || k === 'k') { e.preventDefault(); step(-1); }
  else if (k === 'g') { e.preventDefault(); openJump(); }
  else if (k === '+' || k === '=') setSize(currentSize() + 2);
  else if (k === '-') setSize(currentSize() - 2);
  else if (k === 'd') toggleTheme();
  else if (k === 'f') { e.preventDefault(); startFloat(); }
}

function applySnapshot(snap) {
  agent = snap.agent || agent;
  canSwitch = Boolean(snap.canSwitch);
  renderStatus();
  // Adopt a position changed elsewhere (another window, the CLI) when we're not mid-save.
  const p = snap.position;
  if (quran && pendingSaves === 0 && valid(p) && (p.surah !== pos.surah || p.ayah !== pos.ayah)) {
    pos = { surah: p.surah, ayah: p.ayah };
    renderAyah();
  }
}

async function init() {
  const theme = store.get('quran-turn:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  const size = Number(store.get('quran-turn:size'));
  if (size) setSize(size);

  $('support').href = SUPPORT_URL;
  $('site-note').href = SITE_URL;
  $('version').textContent = ` · v${VERSION}`;
  $('next').addEventListener('click', () => step(1));
  $('prev').addEventListener('click', () => step(-1));
  $('open-jump').addEventListener('click', openJump);
  $('expand-btn').addEventListener('click', () => {
    fetch('/api/expand', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  });
  $('back-btn').addEventListener('click', backToAgent);
  if (canFloat()) {
    $('float-btn').hidden = false;
    $('float-btn').addEventListener('click', startFloat);
    // Floated last time: a gentle nudge, since opening a float needs a click or key.
    if (store.get('quran-turn:float') === '1') $('float-btn').classList.add('nudge');
  }
  $('close-jump').addEventListener('click', closeJump);
  $('jump-search').addEventListener('input', filterSurahs);
  $('jump-form').addEventListener('submit', submitJump);
  // Two text fields and no submit button: Enter doesn't submit implicitly.
  for (const id of ['jump-search', 'jump-ref']) {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('jump-form').requestSubmit(); }
    });
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => renderStatus());
  buildSurahList();

  try {
    quran = await loadText();
    $('verified').hidden = false;
  } catch (err) {
    return fail(err);
  }

  try {
    const snap = await (await fetch('/api/state', { cache: 'no-store' })).json();
    if (valid(snap.position)) pos = { surah: snap.position.surah, ayah: snap.position.ayah };
    agent = snap.agent;
    canSwitch = Boolean(snap.canSwitch);
  } catch {
    try {
      const saved = JSON.parse(store.get('quran-turn:position'));
      if (valid(saved)) pos = saved;
    } catch {}
  }
  renderAyah();
  renderStatus();

  const events = new EventSource('/api/events');
  events.onmessage = (e) => { try { applySnapshot(JSON.parse(e.data)); } catch {} };
}

// Exposed for the end-to-end rendering check (tests walk every ayah).
window.__quranTurn = {
  get quran() { return quran; },
  show(surah, ayah) { pos = { surah, ayah }; renderAyah(); return $('ayah-text').textContent; },
};

init();
