// Window control for the reader. Everything here is best-effort: on any
// failure (no permission, other OS) the reader still works, it just doesn't
// move windows around.
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const MAC_APPS = ['Google Chrome', 'Brave Browser', 'Microsoft Edge', 'Chromium'];
const LINUX_BINS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser', 'microsoft-edge'];
const SIZE = '--window-size=460,740';
const disabled = () => Boolean(process.env.QURAN_TURN_NO_WINDOW);

function run(cmd, args) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function onPath(bin) {
  return (process.env.PATH || '').split(':').some((dir) => existsSync(`${dir}/${bin}`));
}

// The Chromium-family browser the reader runs in as an app window (macOS).
export function readerBrowser() {
  if (process.platform !== 'darwin') return null;
  return MAC_APPS.find((a) => existsSync(`/Applications/${a}.app`)) || null;
}

export function openWindow(url) {
  if (disabled()) return;
  if (process.platform === 'darwin') {
    const app = readerBrowser();
    if (app) return run('open', ['-na', app, '--args', `--app=${url}`, SIZE]);
    return run('open', [url]);
  }
  if (process.platform === 'win32') return run('cmd', ['/c', 'start', '', url]);
  const bin = LINUX_BINS.find(onPath);
  if (bin) return run(bin, [`--app=${url}`, SIZE]);
  return run('xdg-open', [url]);
}

// Only real bundle ids (com.anthropic.claudefordesktop, com.apple.Terminal, …).
export const validBundleId = (id) => typeof id === 'string' && /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(id) && id.length < 200;

export const canSwitch = () => process.platform === 'darwin';

// Bring the app the agent runs in (Claude desktop, Codex, Terminal, iTerm, VS Code…) to the front.
export function focusApp(bundleId) {
  if (disabled() || !canSwitch() || !validBundleId(bundleId)) return false;
  run('open', ['-b', bundleId]);
  return true;
}

// Chrome ignores AppleScript's `minimized`, so instead of minimizing, the reader
// window collapses in place to a small strip (and expands back). Windows are
// found by URL, so an ordinary tab (or quran.allrize.tech) is never touched.
export const COMPACT = { width: 380, height: 112 };
export const FULL = { width: 460, height: 740 };
// Never restore anything bigger than this: the reader is a side window, not full screen.
export const MAX = { width: 560, height: 900 };

function osa(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 4000 }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

// → { id, bounds: [x1, y1, x2, y2] } for the reader's app window, or null.
export async function readerWindow(port) {
  const app = readerBrowser();
  if (disabled() || !app || !Number.isInteger(port)) return null;
  const out = await osa(`
tell application "${app}"
  repeat with i from 1 to count of windows
    if (URL of active tab of window i) starts with "http://127.0.0.1:${port}/" then
      set b to bounds of window i
      return (id of window i as text) & "," & (item 1 of b as text) & "," & (item 2 of b as text) & "," & (item 3 of b as text) & "," & (item 4 of b as text)
    end if
  end repeat
  return ""
end tell`);
  const parts = (out || '').split(',').map(Number);
  if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return null;
  return { id: parts[0], bounds: parts.slice(1) };
}

export async function setReaderBounds(win, bounds, { front = false } = {}) {
  const app = readerBrowser();
  if (disabled() || !app || !win || bounds.some((n) => !Number.isFinite(n))) return false;
  const [x1, y1, x2, y2] = bounds.map(Math.round);
  const out = await osa(`
tell application "${app}"
  set bounds of window id ${Number(win.id)} to {${x1}, ${y1}, ${x2}, ${y2}}
  ${front ? `set index of window id ${Number(win.id)} to 1
  activate` : ''}
  return "ok"
end tell`);
  return out === 'ok';
}
