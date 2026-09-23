import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parseTanzil } from '../app/quran-core.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TEXT_PATH = `${ROOT}data/quran-uthmani.txt`;
export const META_PATH = `${ROOT}data/quran-data.js`;

// Tanzil metadata is a browser script (`var QuranData = {...}`); run it in a sandbox.
export function loadMeta() {
  const ctx = {};
  vm.runInNewContext(readFileSync(META_PATH, 'utf8'), ctx);
  return ctx.QuranData;
}

export function loadQuran() {
  return parseTanzil(readFileSync(TEXT_PATH, 'utf8'));
}

// "Al-Baqara 2:157"
export function formatRef(meta, surah, ayah) {
  return `${meta.Sura[surah][5]} ${surah}:${ayah}`;
}
