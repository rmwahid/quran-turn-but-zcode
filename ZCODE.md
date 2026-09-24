# ZCode support

This is a fork of [quran-turn](https://github.com/rzrizaldy/quran-turn) that adds first class
support for [ZCode](https://z.ai) and fixes two Windows bugs which break the plugin for every
agent on that platform. Everything else is upstream, unchanged.

## Install into ZCode

```bash
node tools-zcode/install-zcode.mjs --verify
# then restart ZCode
```

The script registers this repository as a ZCode marketplace, syncs the plugin cache and enables
`quran-turn@quran-turn`. ZCode reads marketplaces at startup, so restart the app afterwards. If
ZCode ever keeps the plugin disabled, run the script again or enable it in
Settings > Plugin Management.

## Why ZCode works with this plugin

ZCode is compatible with Claude Code plugins, which covers everything the plugin needs:

- it reads `.zcode-plugin/plugin.json` first, then `.claude-plugin/plugin.json`
- it reads `.claude-plugin/marketplace.json` before a root `marketplace.json`
- it loads `hooks/hooks.json` on its own, without the manifest declaring hooks
- it expands `${CLAUDE_PLUGIN_ROOT}` (and the `ZCODE_PLUGIN_ROOT` alias) in hook commands
- it sends the same hook payload on stdin, including `session_id` and `permission_mode`
- all four events used by the plugin exist in ZCode: `UserPromptSubmit`, `PermissionRequest`,
  `PostToolUse`, `Stop`

## Commits on top of upstream

| Commit | Change |
| --- | --- |
| `feat: recognise ZCode as an agent in hooks and reader labels` | Hooks pass `--agent zcode` and the reader label map gains `zcode: 'ZCode'`, so the window shows "ZCode is working" instead of the generic "Agent" fallback |
| `feat: resume the reader after a failed tool call` | ZCode emits `PostToolUseFailure`, an event other agents do not have, mapped to the same `resume` command |
| `fix: let pending handles settle before the hook process exits` | Windows fix, see below |
| `fix: compare static file paths with platform-native separators` | Windows fix, see below |

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

Both fixes are platform bugs rather than ZCode specific, so they are worth reporting upstream.
This fork does not open pull requests against other people's repositories.

## Updating from upstream

`upstream` points at `rzrizaldy/quran-turn` and is fetch only, the push URL is deliberately
disabled so an accidental push to someone else's repository cannot happen.

```bash
git fetch upstream
git rebase upstream/main          # replay the four commits on top of the new upstream
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

24 assertions: the fork's five code markers, the reader server, every asset the UI needs
(including a traversal attempt that must stay blocked), the ZCode label served to the browser,
and the four hook events driven through a shell exactly like `hooks/hooks.json` does, each
expecting exit 0, no stdout, no stderr and the right state transition. It uses a temporary
`QURAN_TURN_HOME` and port, so your real reading state is never touched.

## Runtime notes

- The reader server binds `127.0.0.1:47114` only (override with `QURAN_TURN_PORT`) and exits
  after 30 idle minutes.
- State lives in `~/.quran-turn/`: `state.json` (position), `agent.json` (turn status),
  `config.json` (`{enabled, autoOpen, autoSwitch}`), `sessions.jsonl` (finished turns).
- The browser window opens only when no reader client is connected and at most once every
  15 seconds, so turns do not pile up tabs. Set `autoOpen: false` to open it yourself with
  `http://127.0.0.1:47114/`.
- CLI helpers: `node bin/quran-turn` with `status`, `where`, `log [n]`, `on` / `off`.
