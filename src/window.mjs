// Opens the reader as a small app-style window (Chromium --app) when possible,
// falling back to the default browser. Called only when no reader is connected.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const MAC_APPS = ['Google Chrome', 'Brave Browser', 'Microsoft Edge', 'Chromium'];
const LINUX_BINS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser', 'microsoft-edge'];
const SIZE = '--window-size=460,740';

function run(cmd, args) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function onPath(bin) {
  return (process.env.PATH || '').split(':').some((dir) => existsSync(`${dir}/${bin}`));
}

export function openWindow(url) {
  if (process.env.QURAN_TURN_NO_WINDOW) return;
  if (process.platform === 'darwin') {
    const app = MAC_APPS.find((a) => existsSync(`/Applications/${a}.app`));
    if (app) return run('open', ['-na', app, '--args', `--app=${url}`, SIZE]);
    return run('open', [url]);
  }
  if (process.platform === 'win32') return run('cmd', ['/c', 'start', '', url]);
  const bin = LINUX_BINS.find(onPath);
  if (bin) return run(bin, [`--app=${url}`, SIZE]);
  return run('xdg-open', [url]);
}
