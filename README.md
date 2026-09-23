# Quran Turn

**Read the Qur'an while your coding agent thinks.**

Quran Turn is a plugin for **Claude Code** and **Codex**. When you send your agent a prompt, a quiet reader window opens at the exact ayah you left off. When the agent needs your permission, the reader pauses and points you back to the terminal. When the turn ends, your place is saved.

<p align="center">
  <img src="docs/reader-working.png" width="260" alt="Reader while Claude is working, showing Al-Baqara 2:155">
  <img src="docs/reader-needs-you.png" width="260" alt="Reader paused because Claude needs permission">
  <img src="docs/reader-done-dark.png" width="260" alt="Reader in dark mode after the turn finished, place saved at 2:157">
</p>

- **Exact Qur'an text.** It ships Tanzil's verified Uthmani text byte-for-byte and checks it by SHA-256 before a single letter renders. No code path, and no LLM, ever edits it.
- **Fully offline.** The text, fonts and reader all live on your machine. No account, sync, analytics or telemetry.
- **Knows when you're needed.** It isn't a timer: agent hooks tell it when the agent is working, waiting on you, or done.
- **Calm by design.** No streaks, XP or nag screens, just one log line per turn: where you started and where you stopped.

## Install

Requires **Node.js 18+**. There's nothing to `npm install`, because Quran Turn has zero dependencies.

### Claude Code

```
/plugin marketplace add rzrizaldy/quran-turn
/plugin install quran-turn@quran-turn
```

### Codex

```bash
codex plugin marketplace add rzrizaldy/quran-turn
```

```bash
codex plugin add quran-turn@quran-turn
```

Then start `codex` normally. The first time, Codex asks you to review and **trust** Quran Turn's hooks. Approve them, or nothing will happen (Codex never runs untrusted plugin hooks).

### From source

```bash
git clone https://github.com/rzrizaldy/quran-turn
```

```bash
claude --plugin-dir ./quran-turn
```

Then send any prompt. The reader opens as a small app window if Chrome, Edge, Brave or Chromium is installed, and in your default browser otherwise. It opens once and is reused, so later turns never open another tab.

## How it works

```
 you send a prompt ─▶ UserPromptSubmit ─▶ reader opens · "Claude is working" · counts ayat you read
                                            │
   agent asks approval ─▶ PermissionRequest ─▶ "Claude needs your permission" · counting pauses
                                            │
     you approve, tool runs ─▶ PostToolUse ─▶ back to working
                                            │
             turn ends ─▶ Stop ─▶ place saved · one line appended to your reading log
```

- **Hooks:** they call `bin/quran-turn hook <event>`, print nothing (agents read hook output as context), always exit 0, and take about 40 ms.
- **Reader server:** a tiny local server on `127.0.0.1:47114` serves the reader. The first hook starts it, and it exits after 30 minutes with no reader connected.
- **One hooks file for both agents:** Codex provides `CLAUDE_PLUGIN_ROOT` as an alias and also sets `PLUGIN_ROOT`, which is how Quran Turn tells the two apart.

## Using the reader

| Key | Action |
|---|---|
| `←` `j` `space` | Next ayah (Arabic reads right to left) |
| `→` `k` | Previous ayah |
| `g` | Go to a surah, or type `2:255` |
| `+` / `-` | Text size |
| `d` | Toggle light / dark |

```
quran-turn open        open the reader window
quran-turn where       your current position        → Al-Baqara 2:157  البقرة
quran-turn log [n]     your last n turns            → Sep 22, 8:42 PM  2:153 → 2:157  4 ayat  claude
quran-turn status      one line for a status bar    → ☾ quran-turn · Al-Baqara 2:157 · reading
quran-turn on | off    enable or pause the hooks
```

(From a clone, run these as `node bin/quran-turn …`.)

## Your data stays yours

Everything is plain JSON in `~/.quran-turn/` (override with `QURAN_TURN_HOME`):

| File | What's in it |
|---|---|
| `state.json` | where you are: `{"surah": 2, "ayah": 157}` |
| `agent.json` | whether the agent is working, waiting on you, or done |
| `sessions.jsonl` | one line per turn: `{"from":"2:153","to":"2:157","ayat":4,"agent":"claude", …}` |
| `config.json` | `{"enabled": true, "autoOpen": true}` |

Your prompts, code and anything else from your agent session are **never** stored. Delete these files whenever you like.

## Text accuracy

- **Source.** `data/quran-uthmani.txt` is the **Tanzil Quran Text (Uthmani) v1.1**, downloaded with Tanzil's default options (pause marks and sajdah signs on, rub-el-hizb off). `scripts/fetch-quran.sh` reproduces the download exactly.
- **Pinned.** `data/SHA256SUMS` pins the text, the metadata and the Qur'an font. The reader hashes the file again in the browser and **refuses to render** if it doesn't match.
- **Untouched.** Each ayah goes into the page with `textContent` only: no normalization, trimming or HTML.
- **Basmala.** Tanzil prefixes the basmala to ayah 1 of every surah except 1 and 9. The reader shows it as a header line by splitting the string, and verifies that the pieces join back to the exact original.
- **Checked in the browser.** Every one of the 6,236 ayat was stepped through in the real reader and matched the file exactly.

```bash
npm run verify           # checksums · 114 surahs · 6,236 ayat · per-surah counts · lossless basmala split
```

```bash
npm run verify:remote    # also compares every ayah's letters with a second Tanzil-derived copy
```

The remote check compares against api.alquran.cloud, which serves an older Tanzil build. All 6,236 ayat match letter-for-letter except five, and those five are exactly Tanzil's documented v1.1 corrections (2:181, 8:6 and 13:37 `بَعْدَ مَا`; 12:39 and 12:41 `يَـٰصَـٰحِبَىِ`).

Found a problem with the text itself? Please report it to [Tanzil](https://tanzil.net), which maintains it.

## Support

Quran Turn is free and will stay free: no ads, no paywall, and no Qur'an behind an account. If it has a place in your day, you can support it at **[quran-turn.org](https://quran-turn.org/#support)**:

- **In Indonesia:** QRIS, GoPay, bank transfer or card through Midtrans. Pick 5rb / 10rb / 25rb / 50rb or your own amount.
- **Elsewhere:** [pay with card through Stripe](https://buy.stripe.com/6oUaEYfkugo24pgaPx7ok01).

The desktop app never talks to a payment provider. Its Support link only opens that page.

<details>
<summary>Deploying quran-turn.org</summary>

`site/` is a static site plus two zero-dependency Vercel functions (`/api/donations/config` and `/api/donations/create`) that create Midtrans Snap transactions server-side. Deploy `site/` to Vercel and set these environment variables there, never in the repo:

| Variable | Value |
|---|---|
| `MIDTRANS_SERVER_KEY` | Midtrans server key (server-side only) |
| `MIDTRANS_CLIENT_KEY` | Midtrans client key (sent to the browser for Snap) |
| `MIDTRANS_IS_PRODUCTION` | `true` (use `false` with sandbox keys) |
| `SITE_URL` | `https://quran-turn.org` |

Without keys, the Midtrans button shows "Pembayaran belum tersedia" and everything else keeps working.

</details>

## Development

```bash
npm test          # parser, state machine, hooks (silent + exit 0), server, donation API
```

```bash
npm start         # reader at http://127.0.0.1:47114
```

```
bin/quran-turn          CLI and hook entry point
src/                    state machine, local server, window opener
app/                    the reader (HTML/CSS/JS, bundled fonts)
data/                   Tanzil text + metadata (verbatim) and checksums
hooks/hooks.json        hook wiring for Claude Code and Codex
.claude-plugin/         Claude Code plugin + marketplace manifests
.codex-plugin/          Codex plugin manifest
site/                   quran-turn.org and its donation functions
scripts/                fetch + verify the Qur'an data
test/                   node:test suites
```

Contributions are welcome. The one rule: **never modify anything in `data/`**. Tanzil's license forbids changing the text, and `npm run verify` will catch it.

## Credits & license

- **Code:** [MIT](LICENSE)
- **Qur'an text and metadata:** © [Tanzil Project](https://tanzil.net), CC BY 3.0. Distributed verbatim; changing it is not allowed. See [data/LICENSE-TANZIL.md](data/LICENSE-TANZIL.md).
- **Fonts:** [Amiri Quran](https://github.com/aliftype/amiri), Manrope and DM Mono, all under the SIL Open Font License 1.1 (`app/fonts/OFL-*.txt`).
