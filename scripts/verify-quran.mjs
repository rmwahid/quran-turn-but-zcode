#!/usr/bin/env node
// Verifies the bundled Qur'an data is the exact Tanzil text, complete and well-formed.
// Usage: node scripts/verify-quran.mjs [--remote]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AYAH_COUNT, SURAH_COUNT, parseTanzil, splitBasmala } from '../app/quran-core.js';
import { ROOT, TEXT_PATH, loadMeta } from '../src/quran.mjs';

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => { failed++; console.log(`  ✗ ${msg}`); };
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

console.log('quran-turn · verifying Qur\'an data\n');

// 1. Checksums
for (const line of readFileSync(`${ROOT}data/SHA256SUMS`, 'utf8').trim().split('\n')) {
  const [expected, path] = line.split(/\s+/);
  const actual = createHash('sha256').update(readFileSync(ROOT + path)).digest('hex');
  check(actual === expected, `sha256 ${path}`);
}

// 2. The reader embeds the same text hash
const config = readFileSync(`${ROOT}app/config.js`, 'utf8');
const textHash = createHash('sha256').update(readFileSync(TEXT_PATH)).digest('hex');
check(config.includes(textHash), 'app/config.js QURAN_SHA256 matches data/quran-uthmani.txt');

// 3. Tanzil copyright block is intact
const raw = readFileSync(TEXT_PATH, 'utf8');
check(raw.includes('PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK') &&
  raw.includes('Tanzil Quran Text (Uthmani'), 'Tanzil copyright block present');

// 4. Structure
const { verses, bySurah } = parseTanzil(raw);
const meta = loadMeta();
check(bySurah.length - 1 === SURAH_COUNT, `${SURAH_COUNT} surahs`);
check(verses.size === AYAH_COUNT, `${AYAH_COUNT} ayat (got ${verses.size})`);
let countsOk = true;
let offset = 0;
for (let s = 1; s <= SURAH_COUNT; s++) {
  const [start, ayas] = meta.Sura[s];
  if (bySurah[s].length !== ayas || start !== offset) {
    countsOk = false;
    fail(`surah ${s}: ${bySurah[s].length} ayat, metadata says ${ayas}`);
  }
  offset += ayas;
}
check(countsOk, 'every surah\'s ayah count matches Tanzil metadata');

// 5. Basmala split is lossless everywhere it applies
const fatiha = verses.get('1:1');
let split = 0;
for (let s = 2; s <= SURAH_COUNT; s++) {
  const r = splitBasmala(s, 1, bySurah[s][0], fatiha);
  if (r) {
    split++;
    if (r.basmala + ' ' + r.rest !== bySurah[s][0]) fail(`basmala split lossy at ${s}:1`);
  }
}
check(split === 112, `basmala header detected on 112 surahs (got ${split}; none on 1 and 9)`);

// 6. Optional: cross-check every ayah against a second Tanzil-derived source
if (process.argv.includes('--remote')) {
  console.log('\n  remote: api.alquran.cloud quran-uthmani (Tanzil-derived)');
  const res = await fetch('https://api.alquran.cloud/v1/quran/quran-uthmani');
  const json = await res.json();
  // That mirror serves an older Tanzil build with different options, so tashkeel
  // encodings differ (tatweel, iqlab small-meem, hamza form). What must never differ
  // is the letter skeleton: every word and every letter, in order.
  const skeleton = (s) => s
    .replace(/^﻿/, '')
    .replace(/ٔ/g, 'ء') // combining hamza above ≡ standalone hamza
    .replace(/[ـً-ٰٟۖ-ۭ]/g, '') // tatweel, harakat, Qur'anic marks
    .replace(/\s+/g, ' ')
    .trim();
  // The mirror predates Tanzil v1.1. These are the v1.1 corrections listed at
  // https://tanzil.net/updates/ — the only skeleton differences we accept.
  const TANZIL_V11_CHANGES = {
    '2:181': 'بَعْدَمَا → بَعْدَ مَا',
    '8:6': 'بَعْدَمَا → بَعْدَ مَا',
    '13:37': 'بَعْدَمَا → بَعْدَ مَا',
    '12:39': 'يَـٰصَىٰحِبَىِ → يَـٰصَـٰحِبَىِ (Medina Mushaf)',
    '12:41': 'يَـٰصَىٰحِبَىِ → يَـٰصَـٰحِبَىِ (Medina Mushaf)',
  };
  let exact = 0;
  let skel = 0;
  const diffs = [];
  for (const surah of json.data.surahs) {
    for (const a of surah.ayahs) {
      const key = `${surah.number}:${a.numberInSurah}`;
      const ours = verses.get(key);
      const theirs = a.text.replace(/^﻿/, '');
      if (ours === theirs) exact++;
      if (skeleton(ours) === skeleton(theirs)) skel++;
      else diffs.push(key);
    }
  }
  const known = diffs.filter((k) => k in TANZIL_V11_CHANGES);
  const unknown = diffs.filter((k) => !(k in TANZIL_V11_CHANGES));
  console.log(`  ${exact}/${AYAH_COUNT} ayat byte-identical (tashkeel encoding differs by version/options)`);
  check(skel === AYAH_COUNT - known.length, `letter skeleton identical on ${skel}/${AYAH_COUNT} ayat`);
  for (const k of known) console.log(`    · ${k} Tanzil v1.1 correction: ${TANZIL_V11_CHANGES[k]}`);
  check(unknown.length === 0, `no unexplained differences${unknown.length ? ': ' + unknown.join(', ') : ''}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
