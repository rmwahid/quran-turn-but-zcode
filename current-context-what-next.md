# Quran Turn current context

Last updated: 2026-09-23

## Objective and current deliverable

Quran Turn is a local Qur'an reader plugin for Claude Code and Codex. Version **0.6.0** is published on GitHub; the landing site is live at `https://quran.allrize.tech`.

## Latest implementation

- Codex setup in `README.md` and `site/public/index.html` now names the four Quran Turn hooks to review individually in interactive `codex` → `/hooks`: UserPromptSubmit, PermissionRequest, PostToolUse, and Stop. It explains that installed/enabled does not mean trusted, and that unrelated hooks require their own review.
- Update guides distinguish Claude Code's marketplace auto-update switch from the Codex manual marketplace upgrade/plugin add path. The landing preview shows “Codex is working” and explains the reader names the active agent.
- Bumped package, both plugin manifests, and reader version to 0.6.0. `CHANGELOG.md` and GitHub release notes cover the verified Codex setup. Hook commands, reader behavior, and Qur'an data were unchanged.
- Release commit `6fa646a` was pushed to GitHub `main`; GitHub Actions published `v0.6.0` with tarball and checksum. Cloudflare Pages production deployment `f3b53031-06c1-4e66-b1d8-e9c749673284` serves the updated site.

## Verification

- Local: 32 tests passed; `npm run verify` passed Tanzil checks; `claude plugin validate .`, HTML parse, JavaScript syntax, and `git diff --check` passed. `npm pack --dry-run` included the README, changelog, manifests, hooks, app, and data.
- GitHub Actions run `35874610407` succeeded. The release tag resolves to `6fa646a`; both assets are present, and the downloaded tarball passed its SHA-256 check and contained version 0.6.0.
- The custom domain served the new Codex tutorial, preview, versioned CSS, and v0.6.0 changelog.
- `codex plugin marketplace upgrade quran-turn` plus `codex plugin add quran-turn@quran-turn` installed version 0.6.0, enabled. A normal `codex exec --ephemeral -s read-only -m gpt-5.5` turn without a hook-trust bypass added one `agent: codex` reading session; `agent.json` ended at `done`; reader health reported version 0.6.0 with connected clients.

## Constraints and next actions

- Hook trust is tied to the hook definition, so changed hooks may need another `/hooks` review. The Codex CLI path is verified; a fresh Codex desktop app turn after restart has not been checked.
- The pre-existing untracked `.claude/` directory was intentionally left untouched.
