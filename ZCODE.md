# ZCode support

This is a fork of [quran-turn](https://github.com/rzrizaldy/quran-turn) that adds first class
support for [ZCode](https://z.ai) and fixes two Windows bugs which break the plugin for every
agent on that platform. Everything else is upstream, unchanged.

## Install into ZCode

```bash
node tools-zcode/install-zcode.mjs                                        # installs from this checkout
node tools-zcode/install-zcode.mjs --source rmwahid/quran-turn-but-zcode  # or follow the GitHub fork
node tools-zcode/install-zcode.mjs --verify                               # install, then run the checks
```

Then restart ZCode: plugin components and hooks are read at startup.

The script drives ZCode's own CLI (`<ZCode>/resources/glm/zcode.cjs plugins ...`), because ZCode
keeps an install registry that only its CLI fills. Writing `~/.zcode/cli/plugins` by hand is not
enough: the plugin then shows as enabled in `config.json` and its files sit in `cache/`, but ZCode
never loads it, so no hook ever runs and `plugins list` does not mention it.

Two packaging details are needed for ZCode to accept the plugin:

- A root `marketplace.json`. ZCode builds its plugin catalog from the manifest at the repository
  root; with only `.claude-plugin/marketplace.json` the marketplace registers but stays empty and
  `plugins install` silently finds nothing. The root file mirrors the Claude one and the
  verification fails if the two drift apart.
- Nothing in `.zcode-plugin/plugin.json` that points at a directory. The `hooks` component field
  is a path to a hooks *file*, so `"hooks": "hooks"` only produced a
  `plugin_hook_read_failed` diagnostic. ZCode discovers `hooks/hooks.json` on its own, so the
  field is not declared at all.

## Why ZCode works with this plugin

ZCode is compatible with Claude Code plugins, which covers everything the plugin needs:

- it reads `.zcode-plugin/plugin.json` first, then `.claude-plugin/plugin.json`
- it loads `hooks/hooks.json` on its own, without the manifest declaring hooks
- it expands `${CLAUDE_PLUGIN_ROOT}` (and the `ZCODE_PLUGIN_ROOT` alias) in hook commands
- it sends the same hook payload on stdin, including `session_id` and `permission_mode`
- every event used by the plugin exists in ZCode: `UserPromptSubmit`, `PermissionRequest`,
  `PostToolUse`, `PostToolUseFailure`, `Stop`

Its marketplace catalog is the one place the Claude layout is not enough: ZCode builds it from a
root `marketplace.json`, which is why this fork ships one next to `.claude-plugin/marketplace.json`.

## What this fork changes

Each change is its own commit with a conventional `type:` subject; `git log upstream/main..main`
lists them.

| Change | Why |
| --- | --- |
| Hooks pass `--agent zcode`, the reader label map gains `zcode: 'ZCode'` | The window says "ZCode is working" instead of falling back to a generic "Agent" label |
| `PostToolUseFailure` maps to `resume` | ZCode emits that event when a tool fails; without it the reader stays paused until the next successful tool |
| Windows: the hook exit settles before `process.exit` | Fix 1 below |
| Windows: static paths are compared with `relative()` | Fix 2 below |
| Windows: `.gitattributes` pins LF on the checksummed data files | Fix 3 below |
| ZCode packaging: a root `marketplace.json`, no directory-valued manifest fields, a CLI-driven installer | See [Install into ZCode](#install-into-zcode) |

### Windows fix 1: hook exit code

`bin/quran-turn` calls `process.exit(0)` right after the hook posts to the local server. On
Windows that trips a libuv assertion (`!(handle->flags & UV_HANDLE_CLOSING)`,
`src/win/async.c`) and the process dies with exit code 127 plus stderr output. Agent runtimes
read a non-zero exit as a failed hook, so every single turn reported a failure. A 50 ms settle
before the exit keeps the process inside its hook timeout while measuring clean: exit 0, empty
stdout and stderr, 8 of 8 runs.

### Windows fix 2: the reader UI never loaded

The static file guard in `src/server.mjs` compared a path built by `join()` against a `"/"`
prefix. On Windows `join()` returns backslashes, so the comparison failed for every request and
`GET /` answered `{"error":"not found"}`. The reader window opened but had no HTML, CSS, Quran
text or fonts, which made the plugin unusable on Windows regardless of the agent. The guard now
uses `relative()` plus `isAbsolute()`, which is separator agnostic and keeps the path traversal
protection.

### Windows fix 3: a fresh Windows clone rendered nothing

The reader verifies `data/quran-uthmani.txt` against a SHA-256 pinned in `app/config.js` and
refuses to render anything if it does not match. Upstream ships no `.gitattributes`, so on Windows
`core.autocrlf=true` checks that file out with CRLF endings: 1,402,353 bytes instead of the
1,396,087 the hash was computed from, 6,266 converted line breaks, and the window shows only
"The Qur'an text on disk does not match its pinned checksum". The same conversion breaks
`npm run verify` with "Malformed line", because the parser splits on a bare `\n`. This fork pins
`text eol=lf` on the checksummed data files (`data/quran-uthmani.txt`, `data/quran-data.js`, and the
`data/SHA256SUMS` it is parsed from), and the verification hashes the text against the pin.

All three fixes are platform bugs rather than ZCode specific, so they are worth reporting upstream.
This fork does not open pull requests against other people's repositories.

## Updating from upstream

`upstream` points at `rzrizaldy/quran-turn` and is fetch only, the push URL is deliberately
disabled so an accidental push to someone else's repository cannot happen.

```bash
git fetch upstream
git rebase upstream/main          # replay the fork's commits on the new upstream
node tools-zcode/verify-zcode.mjs --root .   # verify the checkout
node tools-zcode/install-zcode.mjs           # re-sync the ZCode install and cache
git push origin main
```

If `rebase` reports a conflict, the patch targets moved: fix the conflict by keeping the ZCode
behaviour described above, then rerun the verification before pushing.

## Verify

```bash
node tools-zcode/verify-zcode.mjs [--root <plugin dir>] [--port <n>] [--keep]
```

Up to 30 assertions: the fork's markers (hooks carry `--agent zcode`, `PostToolUseFailure`, the
reader label, the ZCode manifest, the root marketplace manifest matching the Claude one, the
checksummed text matching its pin, and the `.gitattributes` rules that keep those bytes intact), a
run of ZCode's own `plugins validate` plus a check that the installed plugin loads without
diagnostics when the runtime is present, the reader server, every asset the UI needs (including a
traversal attempt that must stay blocked), the ZCode label served to the browser, and the four hook
events driven through a shell exactly like `hooks/hooks.json` does, each expecting exit 0, no
stdout, no stderr and the right state transition. It uses a temporary `QURAN_TURN_HOME` and port,
so your real reading state is never touched.

## Runtime notes

- The reader server binds `127.0.0.1:47114` only (override with `QURAN_TURN_PORT`) and exits
  after 30 idle minutes.
- State lives in `~/.quran-turn/`: `state.json` (position), `agent.json` (turn status),
  `config.json` (`{enabled, autoOpen, autoSwitch}`), `sessions.jsonl` (finished turns).
- The browser window opens only when no reader client is connected and at most once every
  15 seconds, so turns do not pile up tabs. Set `autoOpen: false` to open it yourself with
  `http://127.0.0.1:47114/`.
- CLI helpers: `node bin/quran-turn` with `status`, `where`, `log [n]`, `on` / `off`.
