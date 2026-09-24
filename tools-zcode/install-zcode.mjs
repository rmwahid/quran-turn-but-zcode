#!/usr/bin/env node
// Installs quran-turn into ZCode through ZCode's own CLI.
//
// ZCode keeps an install registry that only its own CLI fills. Writing
// ~/.zcode/cli/plugins by hand is not enough: the plugin then shows as enabled in
// config.json and its files sit in cache/, but ZCode never loads it, so no hook
// ever runs. This wrapper locates the ZCode runtime and drives the CLI instead.
//
// Usage:
//   node tools-zcode/install-zcode.mjs [--source <github-repo|url|path>] [--verify]
// Default source: this checkout, so a clone installs itself without network.
// Use --source rmwahid/quran-turn-but-zcode to follow the fork on GitHub.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const MARKETPLACE = 'quran-turn';
const PLUGIN = 'quran-turn';
const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const runtime = [
  process.env.ZCODE_RUNTIME,
  process.platform === 'win32' && join(process.env.ProgramFiles ?? 'C:\\Program Files', 'ZCode', 'resources', 'glm', 'zcode.cjs'),
  process.platform === 'darwin' && '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
  process.platform === 'linux' && '/opt/ZCode/resources/glm/zcode.cjs',
].filter(Boolean).find((p) => existsSync(p));
if (!runtime) {
  console.error('ZCode runtime not found. Set ZCODE_RUNTIME to the app\'s resources/glm/zcode.cjs.');
  process.exit(1);
}

const zcode = (cliArgs) => {
  const r = spawnSync(process.execPath, [runtime, ...cliArgs], { encoding: 'utf8', timeout: 300000 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};
const first = (text) => (text ? text.split('\n')[0] : '');

const source = flag('source') ?? pluginRoot;
console.log(`runtime:  ${runtime}`);
console.log(`source:   ${source}`);

// A marketplace is added once and refreshed afterwards; add also fails when the
// same source is already registered, so fall back to update either way.
const add = zcode(['plugins', 'marketplace', 'add', source]);
if (add.code === 0 && !/already|exists/i.test(add.out)) {
  console.log(`add:      ${first(add.out)}`);
} else {
  const update = zcode(['plugins', 'marketplace', 'update', MARKETPLACE]);
  console.log(`update:   ${first(update.out) || `exit ${update.code}`}`);
}

const install = zcode(['plugins', 'install', `${PLUGIN}@${MARKETPLACE}`]);
console.log(`install:  ${first(install.out) || `exit ${install.code}`}`);

const list = zcode(['plugins', 'list', '--json']);
let entry = null;
try {
  const parsed = JSON.parse(list.out);
  const installed = Array.isArray(parsed) ? parsed : parsed.installed ?? [];
  entry = installed.find((p) => p.id === `${PLUGIN}@${MARKETPLACE}`) ?? null;
} catch {}

if (!entry) {
  console.error('\nquran-turn is not in ZCode\'s installed list after install. Run the CLI by hand to see the error:');
  console.error(`  node "${runtime}" plugins install ${PLUGIN}@${MARKETPLACE}`);
  process.exit(1);
}

const hooks = (entry.hookDetails ?? []).length;
console.log(`\n${entry.id} [${entry.enabled ? 'enabled' : 'disabled'}] version ${entry.version}`);
console.log(`hooks: ${hooks}${hooks ? '' : '  <-- expected 5; ZCode will not run anything without them'}`);
if (entry.diagnostics?.length) console.log(`diagnostics: ${JSON.stringify(entry.diagnostics)}`);

console.log('\nRestart ZCode: plugins and hooks are read at startup.');

if (args.includes('--verify')) {
  console.log('\nRunning verification against the installed copy...');
  const result = spawnSync(process.execPath, [join(pluginRoot, 'tools-zcode', 'verify-zcode.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, QURAN_TURN_NO_WINDOW: '1' },
  });
  process.exit(result.status ?? 1);
}
