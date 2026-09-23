# Quran Turn current context

Last updated: 2026-09-23

## Objective and current deliverable

Quran Turn is a local Qur'an reader plugin for Claude Code and Codex, with a Cloudflare Pages landing site at `quran.allrize.tech`. The current release is v0.5.1.

## Latest implementation

- Corrected the Codex install and update guides in `README.md`, `site/public/index.html`, the release note workflow, and `CHANGELOG.md`. The guides now require `codex plugin list` verification and an interactive Codex CLI `/hooks` review. Installing and enabling a plugin does not trust its hooks; untrusted hooks are skipped.
- Made the Codex update commands visible on the landing page. Updated the site's version-status copy to mention hook trust.
- Bumped package, Claude/Codex plugin manifests, and reader version to 0.5.1. Added the explicit `ON_INSTALL` authentication policy to the Codex marketplace entry. Qur'an source data and reader behavior were preserved.
- Published commit `c450dbf` to GitHub `main`, released tag `v0.5.1`, and deployed the site to Cloudflare Pages production (`d55b4ff6-7531-4a77-b591-4b990fb43beb`).

## Verification

- `npm test`: 32 passed. `npm run verify`: all Tanzil checksum, count, and basmala checks passed. `claude plugin validate .`, JavaScript syntax checks, HTML parse, and `git diff --check` passed.
- GitHub Actions run `35873089055` completed successfully, including tests and release. `codex plugin marketplace upgrade quran-turn` followed by `codex plugin add quran-turn@quran-turn` installed v0.5.1 and `codex plugin list` showed it enabled.
- The production custom domain served the new install/update copy. `/api/changelog` served v0.5.1; the live browser showed `Latest v0.5.1` after it loaded. The update section was visually inspected locally and on production.
- In Codex CLI, the four Quran Turn v0.5.1 hooks were individually reviewed and trusted: `UserPromptSubmit`, `PermissionRequest`, `PostToolUse`, and `Stop`. An unrelated Vercel hook was left untrusted. A normal Codex CLI turn without a trust bypass completed, added one reading-session record with `agent: codex`, left the state at `done`, and started reader server v0.5.1 with a connected reader window.

## Constraints and next actions

- Hook trust is tied to the installed definition, so a future changed hook may require another `/hooks` review. The Codex CLI path is verified; a fresh desktop-app turn after restarting the app remains to be verified.
- The pre-existing untracked `.claude/` directory was intentionally left untouched.
