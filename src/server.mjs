// The local reader server. Binds to 127.0.0.1 only and is the single writer of
// state while it runs: hooks POST their events here instead of touching files.
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { ROOT, loadMeta } from './quran.mjs';
import { applyHook, logError, readJson, setPosition, validPosition } from './state.mjs';
import * as desktop from './window.mjs';

export const DEFAULT_PORT = Number(process.env.QURAN_TURN_PORT) || 47114;
const IDLE_EXIT_MS = 30 * 60 * 1000;
const REOPEN_GUARD_MS = 15 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

// Only these directories are ever served.
const STATIC = { '/data/': join(ROOT, 'data'), '/': join(ROOT, 'app') };

export function snapshot() {
  const agent = readJson('agent.json');
  return {
    position: readJson('state.json'),
    agent,
    config: readJson('config.json'),
    // Whether the reader can offer "Back to Claude/Codex" (macOS + a known host app).
    canSwitch: desktop.canSwitch() && desktop.validBundleId(agent.host),
  };
}

// win: window control, injectable for tests (see src/window.mjs).
export function startServer({ port = DEFAULT_PORT, win = desktop, idleExit = true } = {}) {
  const meta = loadMeta();
  const counts = meta.Sura.map((s) => s[1] ?? 0);
  const clients = new Set();
  let lastActivity = Date.now();
  let lastOpen = 0;
  const url = `http://127.0.0.1:${port}/`;

  const broadcast = () => {
    const data = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const res of clients) res.write(data);
  };

  const maybeOpen = (force = false) => {
    if (clients.size > 0) return false;
    if (!force && (!readJson('config.json').autoOpen || Date.now() - lastOpen < REOPEN_GUARD_MS)) return false;
    lastOpen = Date.now();
    win.openWindow(url);
    return true;
  };

  // "Balancing": while the agent works the reader is full size and in front;
  // when the agent needs you (or is done) it collapses to a small strip and the
  // agent's app comes to the front. Its previous size is restored afterwards.
  let savedBounds = null;
  // Float mode: the reader lives in an always-on-top card, so the main window
  // stays tucked away and nothing is moved automatically.
  let floating = false;
  const collapse = async () => {
    if (clients.size === 0) return;
    const w = await win.readerWindow(port);
    if (!w) return;
    const [x1, y1, x2, y2] = w.bounds;
    if (y2 - y1 > win.COMPACT.height + 40) savedBounds = w.bounds; // don't save an already-collapsed size
    await win.setReaderBounds(w, [x1, y1, x1 + win.COMPACT.width, y1 + win.COMPACT.height]);
  };
  const fullAt = (x1, y1) => [x1, y1, x1 + win.FULL.width, y1 + win.FULL.height];
  const tooBig = ([x1, y1, x2, y2]) => x2 - x1 > win.MAX.width || y2 - y1 > win.MAX.height;
  const expand = async () => {
    if (clients.size === 0) return;
    const w = await win.readerWindow(port);
    if (!w) return;
    const target = savedBounds && !tooBig(savedBounds) ? savedBounds : fullAt(...(savedBounds || w.bounds));
    await win.setReaderBounds(w, target, { front: true });
  };
  // Chrome may restore a remembered (even full-screen) size for a new app
  // window; right after we open one, put it back to the reader's own size.
  const fitNewWindow = async () => {
    const w = await win.readerWindow(port);
    if (w && tooBig(w.bounds)) await win.setReaderBounds(w, fullAt(w.bounds[0], w.bounds[1]));
  };
  const backToAgent = async () => {
    const { host } = readJson('agent.json');
    if (!floating) await collapse();
    return win.focusApp(host);
  };
  const autoSwitch = (event) => {
    if (floating || !readJson('config.json').autoSwitch) return Promise.resolve();
    if (event === 'needs-you' || event === 'stop') return backToAgent();
    if (event === 'start' || event === 'resume') return expand();
    return Promise.resolve();
  };

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (c) => {
        raw += c;
        if (raw.length > 4096) reject(new Error('body too large'));
      });
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
    });

  const server = http.createServer(async (req, res) => {
    lastActivity = Date.now();
    // Refuse anything not addressed to us (DNS-rebinding guard).
    const host = req.headers.host || '';
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return json(res, 403, { error: 'forbidden host' });
    const { pathname } = new URL(req.url, url);

    try {
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`)
          return json(res, 403, { error: 'forbidden origin' });
        if (!String(req.headers['content-type']).startsWith('application/json'))
          return json(res, 415, { error: 'json only' });
        const body = await readBody(req);

        if (pathname === '/api/position') {
          const pos = validPosition(body, counts);
          if (!pos) return json(res, 400, { error: 'invalid position' });
          setPosition(pos, counts);
          broadcast();
          return json(res, 200, snapshot());
        }
        if (pathname === '/api/hook') {
          const before = readJson('agent.json').status;
          const after = applyHook(body.event, { agent: body.agent, session_id: body.session_id, host: body.host }).status;
          broadcast();
          // Reply first so the hook returns immediately; windows move afterwards.
          json(res, 200, { ok: true, clients: clients.size });
          if (body.event === 'start' && maybeOpen()) return;
          if (body.event === 'start' || after !== before) await autoSwitch(body.event).catch(logError);
          return;
        }
        if (pathname === '/api/back-to-agent') return json(res, 200, { focused: await backToAgent() });
        if (pathname === '/api/expand') {
          await expand();
          return json(res, 200, { ok: true });
        }
        if (pathname === '/api/float') {
          floating = Boolean(body.on);
          json(res, 200, { floating });
          // Tuck the main window away while the card floats; bring it back after.
          await (floating ? collapse() : expand()).catch(logError);
          return;
        }
        if (pathname === '/api/open') return json(res, 200, { opened: maybeOpen(true), clients: clients.size });
        if (pathname === '/api/refresh') {
          broadcast();
          return json(res, 200, { ok: true });
        }
        return json(res, 404, { error: 'not found' });
      }

      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      if (pathname === '/api/health') return json(res, 200, { ok: true, app: 'quran-turn', clients: clients.size });
      if (pathname === '/api/state') return json(res, 200, snapshot());
      if (pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
        clients.add(res);
        if (Date.now() - lastOpen < 20_000) setTimeout(() => fitNewWindow().catch(logError), 300);
        req.on('close', () => {
          clients.delete(res);
          if (clients.size === 0) floating = false; // no reader left, so no card either
          lastActivity = Date.now();
        });
        return;
      }

      // Static files
      const prefix = pathname.startsWith('/data/') ? '/data/' : '/';
      const base = STATIC[prefix];
      const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(prefix.length));
      const file = normalize(join(base, rel));
      if (!file.startsWith(base + '/') || !MIME[extname(file)]) return json(res, 404, { error: 'not found' });
      const bytes = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)], 'cache-control': 'no-cache' });
      res.end(bytes);
    } catch (err) {
      if (err.code === 'ENOENT') return json(res, 404, { error: 'not found' });
      logError(err);
      json(res, 500, { error: 'internal error' });
    }
  });

  // Keep SSE connections alive through proxies/sleep.
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
    if (idleExit && clients.size === 0 && Date.now() - lastActivity > IDLE_EXIT_MS) server.close(() => process.exit(0));
  }, 25_000);
  heartbeat.unref();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, url, clients, close: () => { clearInterval(heartbeat); for (const c of clients) c.end(); server.close(); } }));
  });
}
