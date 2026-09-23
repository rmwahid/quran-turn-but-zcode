import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { AYAH_COUNT, parseTanzil, splitBasmala } from '../app/quran-core.js';
import { ROOT, TEXT_PATH, loadMeta, loadQuran } from '../src/quran.mjs';

const meta = loadMeta();
const counts = meta.Sura.map((s) => s[1] ?? 0);
const BIN = join(ROOT, 'bin/quran-turn');

// Every test gets its own empty state dir; no server, no window.
let state;
beforeEach(() => {
  process.env.QURAN_TURN_HOME = mkdtempSync(join(tmpdir(), 'qt-'));
  process.env.QURAN_TURN_NO_SERVER = '1';
  process.env.QURAN_TURN_NO_WINDOW = '1';
  process.env.QURAN_TURN_PORT = '47199'; // nothing listens here
  state = import('../src/state.mjs');
});

describe('Qur’an text', () => {
  test('parses to 6236 ayat and splitting the basmala is lossless', () => {
    const { verses, bySurah } = loadQuran();
    assert.equal(verses.size, AYAH_COUNT);
    const fatiha = verses.get('1:1');
    for (let s = 1; s <= 114; s++) {
      const r = splitBasmala(s, 1, bySurah[s][0], fatiha);
      if (s === 1 || s === 9) assert.equal(r, null);
      else assert.equal(r.basmala + ' ' + r.rest, bySurah[s][0]);
    }
  });

  test('parser keeps text byte-identical to the file lines', () => {
    const raw = readFileSync(TEXT_PATH, 'utf8');
    const { verses } = parseTanzil(raw);
    for (const line of raw.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const [s, a] = line.split('|');
      assert.equal(`${s}|${a}|${verses.get(`${s}:${a}`)}`, line);
    }
  });

  test('every ayah and surah name embedded in site/ matches Tanzil exactly', () => {
    const { verses } = loadQuran();
    let checked = 0;
    for (const f of readdirSync(join(ROOT, 'site')).filter((n) => n.endsWith('.html'))) {
      const html = readFileSync(join(ROOT, 'site', f), 'utf8');
      for (const [, key, text] of html.matchAll(/data-ayah="(\d+:\d+)">([^<]*)</g)) {
        assert.equal(text, verses.get(key), `${f} ${key}`);
        checked++;
      }
      for (const [, s, name] of html.matchAll(/data-surah-name="(\d+)">([^<]*)</g)) {
        assert.equal(name, meta.Sura[Number(s)][4], `${f} surah ${s}`);
      }
      // No Arabic may appear outside those checked elements (plus the ayah-end marker).
      const stripped = html
        .replace(/data-ayah="[^"]*">[^<]*</g, '')
        .replace(/data-surah-name="[^"]*">[^<]*</g, '')
        .replace(/۝[٠-٩]+/g, '');
      assert.ok(!/[؀-ۿ]/.test(stripped), `${f}: unchecked Arabic text`);
    }
    assert.ok(checked > 0);
  });

  test('parser rejects tampering', () => {
    assert.throws(() => parseTanzil('1|1|a\n1|1|b\n'), /Duplicate/);
    assert.throws(() => parseTanzil('1|1|\n'), /Empty/);
    assert.throws(() => parseTanzil('1|2|a\n'), /Out-of-order/);
  });
});

describe('state', () => {
  test('position round-trips and invalid positions are rejected', async () => {
    const { setPosition, readJson, validPosition } = await state;
    assert.equal(validPosition({ surah: 2, ayah: 287 }, counts), null);
    assert.equal(validPosition({ surah: 115, ayah: 1 }, counts), null);
    assert.equal(validPosition({ surah: '2', ayah: 1.5 }, counts), null);
    setPosition({ surah: 2, ayah: 157 }, counts);
    const p = readJson('state.json');
    assert.equal(p.surah, 2);
    assert.equal(p.ayah, 157);
    // atomic writes leave no temp files behind
    assert.deepEqual(readdirSync(process.env.QURAN_TURN_HOME).filter((f) => f.endsWith('.tmp')), []);
  });

  test('a full turn writes one sessions.jsonl line', async () => {
    const { applyHook, setPosition, readJson, readSessions } = await state;
    setPosition({ surah: 2, ayah: 153 }, counts);
    applyHook('start', { agent: 'codex', session_id: 's1' });
    setPosition({ surah: 2, ayah: 154 }, counts); // +1
    setPosition({ surah: 2, ayah: 155 }, counts); // +1
    applyHook('needs-you', { session_id: 's1' });
    setPosition({ surah: 2, ayah: 156 }, counts); // paused: not counted
    applyHook('resume', { session_id: 's1' });
    setPosition({ surah: 2, ayah: 157 }, counts); // +1
    setPosition({ surah: 18, ayah: 10 }, counts); // jump: not counted
    setPosition({ surah: 2, ayah: 157 }, counts); // jump back: not counted
    applyHook('stop', { session_id: 's1' });

    const turns = readSessions();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].from, '2:153');
    assert.equal(turns[0].to, '2:157');
    assert.equal(turns[0].ayat, 3);
    assert.equal(turns[0].agent, 'codex');
    assert.equal(readJson('agent.json').status, 'done');
  });

  test('stop from another session is ignored; a new start closes an interrupted turn', async () => {
    const { applyHook, readJson, readSessions } = await state;
    applyHook('start', { session_id: 'a' });
    applyHook('stop', { session_id: 'b' });
    assert.equal(readJson('agent.json').status, 'working');
    applyHook('start', { session_id: 'b' });
    const turns = readSessions();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].interrupted, true);
  });

  test('crossing a surah boundary counts as the next ayah', async () => {
    const { applyHook, setPosition, readJson } = await state;
    setPosition({ surah: 1, ayah: 7 }, counts);
    applyHook('start', {});
    setPosition({ surah: 2, ayah: 1 }, counts);
    assert.equal(readJson('agent.json').ayat, 1);
  });

  test('`quran-turn off` disables turns', async () => {
    const { applyHook, writeJson, readJson } = await state;
    writeJson('config.json', { enabled: false });
    applyHook('start', {});
    assert.equal(readJson('agent.json').status, 'idle');
  });
});

describe('hook CLI', () => {
  const run = (args, input = '') =>
    spawnSync(process.execPath, [BIN, ...args], { input, env: process.env, encoding: 'utf8', timeout: 10_000 });

  test('prints nothing, exits 0 and falls back to files when no server runs', async () => {
    const payload = JSON.stringify({ session_id: 'x', hook_event_name: 'UserPromptSubmit', prompt: 'secret' });
    for (const event of ['start', 'needs-you', 'resume', 'needs-you', 'stop']) {
      const r = run(['hook', event], payload);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, '');
    }
    const { readSessions } = await state;
    const turns = readSessions();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].agent, 'claude');
    // prompts are never stored
    assert.ok(!readFileSync(join(process.env.QURAN_TURN_HOME, 'sessions.jsonl'), 'utf8').includes('secret'));
  });

  test('survives garbage stdin and unknown events', () => {
    for (const args of [['hook', 'start'], ['hook', 'nope'], ['hook']]) {
      const r = run(args, '{not json');
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    }
  });

  test('detects Codex from PLUGIN_ROOT', async () => {
    const r = spawnSync(process.execPath, [BIN, 'hook', 'start'], {
      input: '{}', env: { ...process.env, PLUGIN_ROOT: ROOT }, encoding: 'utf8',
    });
    assert.equal(r.status, 0);
    const { readJson } = await state;
    assert.equal(readJson('agent.json').agent, 'codex');
  });

  test('status line', () => {
    const out = execFileSync(process.execPath, [BIN, 'status'], { env: process.env, encoding: 'utf8' });
    assert.equal(out.trim(), '☾ quran-turn · Al-Faatiha 1:1 · idle');
  });
});

describe('server', () => {
  test('serves the reader, validates input, applies hooks and refuses foreign hosts', async () => {
    const { startServer } = await import('../src/server.mjs');
    const opened = [];
    const port = 47000 + Math.floor(Math.random() * 900);
    const srv = await startServer({ port, open: (u) => opened.push(u), idleExit: false });
    const base = `http://127.0.0.1:${port}`;
    const post = (path, body, headers = {}) =>
      fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    try {
      assert.equal((await fetch(base + '/')).status, 200);
      const txt = await (await fetch(base + '/data/quran-uthmani.txt')).arrayBuffer();
      assert.deepEqual(Buffer.from(txt), readFileSync(TEXT_PATH));
      assert.equal((await fetch(base + '/../package.json')).status, 404);
      assert.equal((await fetch(base + '/data/SHA256SUMS')).status, 404);

      assert.equal((await post('/api/position', { surah: 2, ayah: 999 })).status, 400);
      assert.equal((await post('/api/position', { surah: 2, ayah: 255 })).status, 200);
      assert.equal((await post('/api/position', { surah: 2, ayah: 1 }, { origin: 'https://evil.example' })).status, 403);

      assert.equal((await post('/api/hook', { event: 'start', agent: 'claude' })).status, 200);
      assert.equal(opened.length, 1, 'opens the window when no reader is connected');
      await post('/api/hook', { event: 'start', agent: 'claude' });
      assert.equal(opened.length, 1, 'does not reopen within the guard window');

      const state = await (await fetch(base + '/api/state')).json();
      assert.equal(state.position.ayah, 255);
      assert.equal(state.agent.status, 'working');
    } finally {
      srv.close();
    }
  });
});
