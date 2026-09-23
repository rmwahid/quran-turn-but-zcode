// Shared by the reader (browser) and the CLI/verify scripts (Node).
// It only *reads* the Tanzil text. It never normalizes, trims or rewrites
// ayah strings — the Qur'an text is rendered exactly as Tanzil ships it.

export const SURAH_COUNT = 114;
export const AYAH_COUNT = 6236;

// Parse Tanzil "txt-2" format: `sura|aya|text` per line, `#` comment block at the end.
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
