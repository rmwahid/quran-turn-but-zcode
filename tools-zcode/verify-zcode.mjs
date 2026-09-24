#!/usr/bin/env node
// Verifies a quran-turn install the way ZCode uses it: the reader server, the
// static assets the UI needs, and the four hook events driven through a shell
// exactly like the hook commands in hooks/hooks.json.
//
// Usage: node tools-zcode/verify-zcode.mjs [--root <plugin dir>] [--port <n>] [--keep]
// Default root: the newest version in ~/.zcode/cli/plugins/cache/quran-turn/quran-turn.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const cacheRoot = join(homedir(), '.zcode', 'cli', 'plugins', 'cache', 'quran-turn', 'quran-turn');
const newestCache = () => {
  if (!existsSync(cacheRoot)) return null;
  const versions = readdirSync(cacheRoot).filter((v) => existsSync(join(cacheRoot, v, 'package.json')));
  const rank = (v) => v.split('.').map(Number);
  versions.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  });
  return versions.length ? join(cacheRoot, versions[versions.length - 1]) : null;
};

const root = flag('root') ?? newestCache();
if (!root || !existsSync(join(root, 'bin', 'quran-turn'))) {
  console.error(`plugin root not found (${root ?? 'no cache dir'}). Pass --root <plugin dir>.`);
  process.exit(1);
}
const port = Number(flag('port') ?? 47160);
const keep = args.includes('--keep');
const home = join(tmpdir(), `quran-turn-verify-${process.pid}`);
const env = { ...process.env, QURAN_TURN_HOME: home, QURAN_TURN_PORT: String(port), QURAN_TURN_NO_WINDOW: '1' };
const bin = join(root, 'bin', 'quran-turn');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? ` -- ${detail}` : ''}`);
};

// 1. the code under test carries the fork's changes
const fileHas = (rel, needle) => {
  try { return readFileSync(join(root, rel), 'utf8').includes(needle); } catch { return false; }
};
check('hooks pass --agent zcode', fileHas('hooks/hooks.json', '--agent zcode'));
check('hooks handle PostToolUseFailure', fileHas('hooks/hooks.json', 'PostToolUseFailure'));
check('reader labels ZCode', fileHas('app/reader.js', "zcode: 'ZCode'"));
check('ZCode manifest present', (() => {
  try {
    return JSON.parse(readFileSync(join(root, '.zcode-plugin', 'plugin.json'), 'utf8')).name === 'quran-turn';
  } catch {
    return false;
  }
})());
// ZCode builds its plugin catalog from the root marketplace.json, Claude Code from
// the .claude-plugin one. They must not drift apart.
check('root marketplace.json matches the Claude one', (() => {
  try {
    const rootManifest = readFileSync(join(root, 'marketplace.json'), 'utf8');
    const claudeManifest = readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8');
    return JSON.stringify(JSON.parse(rootManifest)) === JSON.stringify(JSON.parse(claudeManifest));
  } catch {
    return false;
  }
})());

// ZCode's own runtime can validate the manifest and every component path it
// references. Best effort: skipped when the runtime is not where we expect it.
const runtime = [
  process.env.ZCODE_RUNTIME,
  process.platform === 'win32' && join(process.env.ProgramFiles ?? 'C:\\Program Files', 'ZCode', 'resources', 'glm', 'zcode.cjs'),
  process.platform === 'darwin' && '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
  process.platform === 'linux' && '/opt/ZCode/resources/glm/zcode.cjs',
].filter(Boolean).find((p) => existsSync(p));
if (runtime) {
  const r = spawnSync(process.execPath, [runtime, 'plugins', 'validate', root], { encoding: 'utf8' });
  check('ZCode runtime validates the plugin', r.status === 0, `${r.stdout ?? ''}${r.stderr ?? ''}`.trim());

  // The installed copy must load without diagnostics. ZCode reports things like a
  // manifest component field pointing at a missing file here, which is easy to
  // ship by accident because the plugin still appears to work otherwise.
  const list = spawnSync(process.execPath, [runtime, 'plugins', 'list', '--json'], { encoding: 'utf8' });
  let installed = null;
  try {
    const parsed = JSON.parse(list.stdout ?? '');
    const entries = Array.isArray(parsed) ? parsed : parsed.installed ?? [];
    installed = entries.find((p) => p.id === 'quran-turn@quran-turn') ?? null;
  } catch {}
  if (installed) {
    const diagnostics = installed.diagnostics ?? [];
    check('ZCode loads the plugin without diagnostics', diagnostics.length === 0, JSON.stringify(diagnostics));
  } else {
    console.log('skip  quran-turn is not installed in ZCode, diagnostics check not run');
  }
} else {
  console.log('skip  ZCode runtime not found, manifest validation not run');
}
check('hook exit settles first (Windows)', fileHas('bin/quran-turn', 'aborts with a libuv assertion'));
check('static guard uses relative()', fileHas('src/server.mjs', 'const inside = relative(base, file);'));

// The reader refuses to render anything unless the text matches its pinned SHA-256,
// so a Windows checkout with CRLF endings silently breaks the whole UI. Guard the
// bytes themselves and the git rule that keeps them intact on a fresh clone.
check('Quran text matches the pinned checksum', (() => {
  try {
    const pinned = (readFileSync(join(root, 'app', 'config.js'), 'utf8').match(/QURAN_SHA256 = '([a-f0-9]{64})'/) ?? [])[1];
    const actual = createHash('sha256').update(readFileSync(join(root, 'data', 'quran-uthmani.txt'))).digest('hex');
    return Boolean(pinned) && pinned === actual;
  } catch {
    return false;
  }
})());
check('.gitattributes keeps the data files LF-only', (() => {
  const rules = readFileSync(join(root, '.gitattributes'), 'utf8');
  return ['data/quran-uthmani.txt', 'data/quran-data.js'].every((file) =>
    new RegExp(`^${file.replace(/[.]/g, '\\.')}\\s+text\\s+eol=lf$`, 'm').test(rules));
})());

// 2. reader server
const server = spawn(process.execPath, [bin, 'serve'], { env, stdio: 'ignore' });
const health = async () => {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      const j = await r.json();
      if (j.app === 'quran-turn') return j;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
};

const finish = async (code) => {
  try { await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch {}
  server.kill();
  if (!keep) rmSync(home, { recursive: true, force: true });
  console.log(`\n${results.every(Boolean) ? 'PASS' : 'FAILED'} (${results.filter(Boolean).length}/${results.length} checks)`);
  process.exit(code);
};

const info = await health();
check('reader server answers on 127.0.0.1', Boolean(info), `no /api/health on port ${port}`);
if (!info) await finish(1);
check('server version matches manifest', info.version === JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, `${info.version}`);

// 3. the assets the UI needs, plus path traversal
const wanted = [
  ['/', 'text/html'],
  ['/reader.js', 'text/javascript'],
  ['/reader.css', 'text/css'],
  ['/quran-core.js', 'text/javascript'],
  ['/data/quran-data.js', 'text/javascript'],
  ['/data/quran-uthmani.txt', 'text/plain'],
  ['/fonts/AmiriQuran.woff2', 'font/woff2'],
];
for (const [path, type] of wanted) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await r.arrayBuffer();
    const ct = (r.headers.get('content-type') ?? '').split(';')[0];
    check(`GET ${path}`, r.status === 200 && ct === type && body.byteLength > 0, `status ${r.status}, type ${ct}, ${body.byteLength}B`);
  } catch (e) {
    check(`GET ${path}`, false, e.message);
  }
}
for (const path of ['/../package.json', '/data/../package.json', '/..%2fpackage.json']) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`);
    check(`traversal blocked: ${path}`, r.status === 404, `status ${r.status}`);
  } catch (e) {
    check(`traversal blocked: ${path}`, false, e.message);
  }
}
try {
  const served = await (await fetch(`http://127.0.0.1:${port}/reader.js`)).text();
  check('served reader.js carries the ZCode label', served.includes("zcode: 'ZCode'"));
} catch (e) {
  check('served reader.js carries the ZCode label', false, e.message);
}

// 4. hook events, run through a shell like the hook commands do
const state = () => {
  try { return JSON.parse(readFileSync(join(home, 'agent.json'), 'utf8')).status; } catch { return 'missing'; }
};
const hook = (sub, event, expect) => {
  const payload = JSON.stringify({ session_id: 'verify', hook_event_name: event, cwd: process.cwd() });
  const r = spawnSync(`node "${bin}" hook ${sub} --agent zcode`, { shell: true, env, input: payload, encoding: 'utf8', timeout: 20000 });
  const clean = r.status === 0 && !r.stdout.trim() && !(r.stderr ?? '').trim();
  check(`hook ${sub} (${event})`, clean && state() === expect,
    `exit ${r.status}, stdout ${JSON.stringify(r.stdout)}, stderr ${JSON.stringify(r.stderr)}, state ${state()}`);
};
hook('start', 'UserPromptSubmit', 'working');
hook('needs-you', 'PermissionRequest', 'needs_you');
hook('resume', 'PostToolUse', 'working');
hook('needs-you', 'PermissionRequest', 'needs_you');
hook('resume', 'PostToolUseFailure', 'working');
hook('stop', 'Stop', 'done');

await finish(results.every(Boolean) ? 0 : 1);
