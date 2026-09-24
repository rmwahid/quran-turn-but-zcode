#!/usr/bin/env node
// Registers this fork as a ZCode marketplace and installs the plugin from it.
//
// ZCode keeps plugin state under ~/.zcode/cli:
//   plugins/known_marketplaces.json        registered marketplaces
//   plugins/marketplaces/<id>/             the marketplace clone
//   plugins/cache/<id>/<plugin>/<ver>/     the copy ZCode actually loads
//   config.json -> plugins.enabledPlugins  enable state
//
// ZCode reads marketplaces at startup, so restart the app afterwards.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKETPLACE = 'quran-turn';
const PLUGIN = 'quran-turn';
const REPO = 'rmwahid/quran-turn-but-zcode';
const CLONE_URL = `https://github.com/${REPO}.git`;

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(here); // the repo root is the plugin root
const CLI = join(homedir(), '.zcode', 'cli');
const PLUGINS = join(CLI, 'plugins');
const MKT_DIR = join(PLUGINS, 'marketplaces', MARKETPLACE);
const KNOWN = join(PLUGINS, 'known_marketplaces.json');
const CONFIG = join(CLI, 'config.json');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const git = (...args) => execFileSync('git', args, { cwd: MKT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (!existsSync(CLI)) {
  console.error(`ZCode config not found at ${CLI}. Install and run ZCode once first.`);
  process.exit(1);
}

// 1. the marketplace clone ZCode reads the plugin from
if (existsSync(MKT_DIR)) {
  const origin = git('remote', 'get-url', 'origin');
  if (!origin.includes(REPO)) {
    console.log(`marketplace clone points at ${origin}, replacing it with ${REPO}`);
    rmSync(MKT_DIR, { recursive: true, force: true });
  }
}
if (!existsSync(MKT_DIR)) {
  mkdirSync(join(PLUGINS, 'marketplaces'), { recursive: true });
  execFileSync('git', ['clone', CLONE_URL, MKT_DIR], { stdio: 'inherit' });
}
git('fetch', '--tags', '--prune', 'origin');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || 'main';
if (branch !== 'HEAD') {
  git('checkout', '--force', branch);
  git('reset', '--hard', `origin/${branch}`);
}
git('clean', '-fd');
console.log(`marketplace: ${REPO} @ ${git('rev-parse', '--short', 'HEAD')} (${branch})`);

// 2. sync the plugin cache ZCode loads
const version = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json')).version;
const cache = join(PLUGINS, 'cache', MARKETPLACE, PLUGIN, version);
rmSync(cache, { recursive: true, force: true });
cpSync(pluginRoot, cache, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) });
mkdirSync(join(PLUGINS, 'data', `${PLUGIN}@${MARKETPLACE}`), { recursive: true });
console.log(`cache: ${cache}`);

// 3. register the marketplace
const known = readJson(KNOWN);
const previous = (known.marketplaces ?? []).find((m) => m.id === MARKETPLACE);
const now = new Date().toISOString();
known.marketplaces = [
  ...(known.marketplaces ?? []).filter((m) => m.id !== MARKETPLACE),
  {
    id: MARKETPLACE,
    source: { source: 'github', repo: REPO },
    name: MARKETPLACE,
    description: 'Quran Turn, with ZCode support and Windows fixes.',
    addedAt: previous?.addedAt ?? now,
    pluginCount: 1,
    lastUpdated: now,
  },
];
writeJson(KNOWN, known);
console.log(`marketplace registered: ${MARKETPLACE}`);

// 4. enable the plugin
const config = readJson(CONFIG);
config.plugins ??= {};
config.plugins.enabledPlugins ??= {};
config.plugins.enabledPlugins[`${PLUGIN}@${MARKETPLACE}`] = true;
writeJson(CONFIG, config);
console.log(`enabled: ${PLUGIN}@${MARKETPLACE}`);

// 5. report
const cacheRoot = join(PLUGINS, 'cache', MARKETPLACE, PLUGIN);
const versions = readdirSync(cacheRoot).filter((v) => existsSync(join(cacheRoot, v, 'package.json')));
console.log(`cached versions: ${versions.join(', ')}`);
console.log('\nRestart ZCode to pick up the marketplace and plugin.');
console.log('If ZCode keeps the plugin disabled, run this script again or enable it in Settings > Plugin Management.');

if (process.argv.includes('--verify')) {
  console.log('\nRunning verification...');
  const result = spawnSync(process.execPath, [join(here, 'verify-zcode.mjs'), '--root', cache], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
