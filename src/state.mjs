// All state is plain JSON under ~/.quran-turn (or $QURAN_TURN_HOME):
//   state.json      where you are:           {surah, ayah, updated_at}
//   agent.json      what the agent is doing: {status, agent, session_id, turn_started_at, turn_from, ayat, last_turn}
//   sessions.jsonl  one line per finished turn
//   config.json     {enabled, autoOpen}
// Delete any of them at any time; defaults come back.
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const home = () => process.env.QURAN_TURN_HOME || join(homedir(), '.quran-turn');

const DEFAULTS = {
  'state.json': { surah: 1, ayah: 1, updated_at: null },
  'agent.json': { status: 'idle' },
  'config.json': { enabled: true, autoOpen: true },
};

export function readJson(name) {
  try {
    return { ...DEFAULTS[name], ...JSON.parse(readFileSync(join(home(), name), 'utf8')) };
  } catch {
    return { ...DEFAULTS[name] };
  }
}

export function writeJson(name, value) {
  mkdirSync(home(), { recursive: true });
  const path = join(home(), name);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, path); // atomic on the same filesystem
}

export function appendSession(entry) {
  mkdirSync(home(), { recursive: true });
  appendFileSync(join(home(), 'sessions.jsonl'), JSON.stringify(entry) + '\n');
}

export function readSessions() {
  try {
    return readFileSync(join(home(), 'sessions.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function logError(err) {
  try {
    mkdirSync(home(), { recursive: true });
    appendFileSync(join(home(), 'error.log'), `${new Date().toISOString()} ${err?.stack || err}\n`);
  } catch {}
}

const now = () => new Date().toISOString();
const ref = (p) => `${p.surah}:${p.ayah}`;

// ── Position ────────────────────────────────────────────────────────────────

// counts[s] = number of ayat in surah s (1-based). Returns a clean position or null.
export function validPosition(p, counts) {
  const surah = Number(p?.surah);
  const ayah = Number(p?.ayah);
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > counts[surah]) return null;
  return { surah, ayah };
}

// Global 0-based index across the mushaf, used to tell "next ayah" from a jump.
export function globalIndex(p, counts) {
  let i = 0;
  for (let s = 1; s < p.surah; s++) i += counts[s];
  return i + p.ayah - 1;
}

// Save a new position. While the agent is working, stepping to the very next
// ayah counts toward this turn; jumps and going back do not.
export function setPosition(next, counts) {
  const prev = readJson('state.json');
  const pos = { ...next, updated_at: now() };
  writeJson('state.json', pos);
  const agent = readJson('agent.json');
  if (agent.status === 'working' && globalIndex(next, counts) === globalIndex(prev, counts) + 1) {
    agent.ayat = (agent.ayat || 0) + 1;
    writeJson('agent.json', agent);
  }
  return { position: pos, agent };
}

// ── Turn state machine ──────────────────────────────────────────────────────
//   idle/done ──start──▶ working ──needs-you──▶ needs_you ──resume──▶ working
//   working/needs_you ──stop──▶ done  (one line appended to sessions.jsonl)

function finishTurn(agent, { interrupted = false } = {}) {
  const pos = readJson('state.json');
  const entry = {
    started_at: agent.turn_started_at,
    ended_at: now(),
    from: agent.turn_from,
    to: ref(pos),
    ayat: agent.ayat || 0,
    agent: agent.agent,
  };
  if (interrupted) entry.interrupted = true;
  appendSession(entry);
  return entry;
}

export function applyHook(event, { agent: agentName = 'claude', session_id = null } = {}) {
  const config = readJson('config.json');
  let agent = readJson('agent.json');
  const active = agent.status === 'working' || agent.status === 'needs_you';
  const sameSession = !session_id || !agent.session_id || agent.session_id === session_id;

  if (event === 'start') {
    if (!config.enabled) return agent;
    let last_turn = agent.last_turn;
    if (active) last_turn = finishTurn(agent, { interrupted: true });
    agent = {
      status: 'working',
      agent: agentName,
      session_id,
      turn_started_at: now(),
      turn_from: ref(readJson('state.json')),
      ayat: 0,
      last_turn,
    };
  } else if (event === 'needs-you') {
    if (agent.status !== 'working' || !sameSession) return agent;
    agent = { ...agent, status: 'needs_you' };
  } else if (event === 'resume') {
    if (agent.status !== 'needs_you' || !sameSession) return agent;
    agent = { ...agent, status: 'working' };
  } else if (event === 'stop') {
    if (!active || !sameSession) return agent;
    agent = { status: 'done', agent: agent.agent, last_turn: finishTurn(agent) };
  } else {
    throw new Error(`Unknown hook event: ${event}`);
  }
  writeJson('agent.json', agent);
  return agent;
}
