// Shared by the reader (browser) and the CLI/verify scripts (Node).
// It only *reads* the Tanzil text. It never normalizes, trims or rewrites
// ayah strings — the Qur'an text is rendered exactly as Tanzil ships it.

export const SURAH_COUNT = 114;
export const AYAH_COUNT = 6236;

// Parse Tanzil "txt-2" format: `sura|aya|text` per line, `#` comment block at the end.
// Lines are split on a bare "\n", so the data files have to reach disk with LF
// endings (.gitattributes pins that). With CRLF every line keeps a trailing "\r"
// and this throws "Malformed line" before the first ayah is read.
export function parseTanzil(raw) {
  const verses = new Map();
  const bySurah = [[]];
  for (const line of raw.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const a = line.indexOf('|');
    const b = line.indexOf('|', a + 1);
    if (a < 1 || b < a + 2) throw new Error(`Malformed line: ${line.slice(0, 40)}`);
    const surah = Number(line.slice(0, a));
    const ayah = Number(line.slice(a + 1, b));
    const text = line.slice(b + 1);
    const key = `${surah}:${ayah}`;
    if (verses.has(key)) throw new Error(`Duplicate ayah ${key}`);
    if (!text) throw new Error(`Empty ayah ${key}`);
    verses.set(key, text);
    (bySurah[surah] ||= []).push(text);
    if (bySurah[surah].length !== ayah) throw new Error(`Out-of-order ayah ${key}`);
  }
  return { verses, bySurah };
}

// Tanzil prefixes the basmala to ayah 1 of every surah except 1 and 9.
// For display we show it as a header line, but we only *split* the string:
// basmala + ' ' + rest === text, always. Returns null when there is no prefix.
export function splitBasmala(surah, ayah, text, fatihaBasmala) {
  if (ayah !== 1 || surah === 1 || surah === 9) return null;
  const words = text.split(' ');
  const ref = fatihaBasmala.split(' ');
  if (words.length <= ref.length) return null;
  // Words 2..4 must match exactly; word 1 may carry an extra mark (e.g. 95:1, 97:1).
  for (let i = 1; i < ref.length; i++) if (words[i] !== ref[i]) return null;
  if (words[0][0] !== ref[0][0]) return null;
  const basmala = words.slice(0, ref.length).join(' ');
  const rest = text.slice(basmala.length + 1);
  if (basmala + ' ' + rest !== text) return null;
  return { basmala, rest };
}

// Arabic-Indic digits for the ayah-end marker (presentation only, not part of the text).
export function arabicDigits(n) {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Search and jump ─────────────────────────────────────────────────────────
// Everything below is for *finding* a place. Normalized strings are used only
// for matching and are never shown; results point at (surah, ayah) and the
// reader renders the verbatim Tanzil text for them.

// Arabic: drop harakat, Qur'anic marks and tatweel; unify alef/yaa/taa-marbuta
// forms. The small (dagger) alef becomes a plain alef, so modern spelling like
// "العالمين" matches the Uthmani "ٱلْعَـٰلَمِينَ".
export function arabicKey(s) {
  return s
    .replace(/\u0670/g, '\u0627')
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0671\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .replace(/\s+/g, ' ')
    .trim();
}

// Looser still: the consonant skeleton (no long vowels), so "الصلاة" also finds
// the Uthmani "ٱلصَّلَوٰةَ". Used only as a fallback after exact matches.
export const skeletonKey = (s) => arabicKey(s).replace(/[\u0627\u0648\u064A]/g, '');

// Latin surah names: "Al-Faatiha", "Yaseen", "Al-Kahf" should match "fatihah", "yasin", "kahfi".
export function latinKey(s) {
  return s
    .toLowerCase()
    .replace(/^(al|an|ar|as|at|ad|adh|az|ash|ath)[\s-]+/, '')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/e/g, 'i')
    .replace(/h$/, '');
}

const hasArabic = (s) => /[؀-ۿ]/.test(s);

// → [{ kind: 'ayah' | 'surah' | 'juz' | 'page', surah, ayah, n? }], best first.
// meta is Tanzil's QuranData; verses/bySurah come from parseTanzil(); index is
// buildSearchIndex(bySurah) (only needed for Arabic text search).
export function resolveQuery(query, meta, bySurah, index = null, { limit = 50 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const count = (s) => bySurah[s]?.length || 0;
  const out = [];
  const add = (r) => {
    if (r.surah >= 1 && r.surah <= 114 && r.ayah >= 1 && r.ayah <= count(r.surah)) out.push(r);
  };

  let m;
  if ((m = q.match(/^(\d{1,3})\s*[:.\s-]\s*(\d{1,3})$/))) add({ kind: 'ayah', surah: +m[1], ayah: +m[2] });
  if ((m = q.match(/^(?:juz'?|jz|j|part)\s*(\d{1,2})$/i)) && +m[1] >= 1 && +m[1] <= 30) {
    const [surah, ayah] = meta.Juz[+m[1]];
    add({ kind: 'juz', n: +m[1], surah, ayah });
  }
  if ((m = q.match(/^(?:page|p|hal|halaman)\s*(\d{1,3})$/i)) && +m[1] >= 1 && +m[1] <= 604) {
    const [surah, ayah] = meta.Page[+m[1]];
    add({ kind: 'page', n: +m[1], surah, ayah });
  }
  if ((m = q.match(/^(\d{1,3})$/)) && +m[1] >= 1 && +m[1] <= 114) add({ kind: 'surah', surah: +m[1], ayah: 1 });
  if (out.length) return out;

  // Surah names (Latin transliteration, English meaning, Arabic name), best match first.
  const qa = hasArabic(q) ? arabicKey(q) : null;
  const ql = latinKey(q);
  const qe = q.toLowerCase();
  const named = [];
  for (let s = 1; s <= 114; s++) {
    const [, , , , ar, tr, en] = meta.Sura[s];
    let score = -1;
    if (qa) {
      const ak = arabicKey(ar);
      score = ak === qa ? 0 : ak.startsWith(qa) ? 1 : ak.includes(qa) ? 2 : -1;
    } else {
      const lk = latinKey(tr);
      if (ql.length >= 2 && lk === ql) score = 0;
      else if (ql.length >= 3 && lk.startsWith(ql)) score = 1;
      else if (ql.length >= 3 && (lk.includes(ql) || (lk.length >= 4 && ql.includes(lk)))) score = 2;
      else if (qe.length >= 3 && en.toLowerCase().includes(qe)) score = 3;
    }
    if (score >= 0) named.push([score, s]);
  }
  named.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, s] of named) add({ kind: 'surah', surah: s, ayah: 1 });

  // Arabic words: search the text of every ayah; exact spelling first, then skeleton.
  if (qa && qa.length >= 2 && index) {
    const seen = new Set();
    const take = (pred) => {
      for (const [surah, ayah, key, skel] of index) {
        if (out.length >= limit) return;
        if (!seen.has(`${surah}:${ayah}`) && pred(key, skel)) {
          seen.add(`${surah}:${ayah}`);
          add({ kind: 'ayah', surah, ayah, match: true });
        }
      }
    };
    take((key) => key.includes(qa));
    const qs = skeletonKey(q);
    if (qs.length >= 2) take((_, skel) => skel.includes(qs));
  }
  return out;
}

// The basmala Tanzil prefixes to ayah 1 of 112 surahs is left out of the search
// keys (only), so a search for "الرحمن الرحيم" finds ayat that say it, not
// every surah opening. 1:1 itself stays searchable. Display is unaffected.
export function buildSearchIndex(bySurah) {
  const index = [];
  const fatiha = bySurah[1][0];
  for (let s = 1; s < bySurah.length; s++) {
    bySurah[s].forEach((t, i) => {
      const split = splitBasmala(s, i + 1, t, fatiha);
      const body = split ? split.rest : t;
      index.push([s, i + 1, arabicKey(body), skeletonKey(body)]);
    });
  }
  return index;
}

// Handy starting points (Friday's Al-Kahf, Yasin, nightly Al-Mulk, Juz 'Amma).
export const QUICK_STARTS = [
  { label: 'Al-Fatihah', query: '1' },
  { label: "Juz 'Amma", query: 'juz 30' },
  { label: 'Al-Kahf', query: '18' },
  { label: 'Yasin', query: '36' },
  { label: 'Al-Mulk', query: '67' },
];
