# Changelog

Every release of Quran Turn. The newest is on top. GitHub release notes and the timeline on [quran.allrize.tech](https://quran.allrize.tech/#changelog) are generated from this file.

## [0.5.0] - 2026-09-23

Ngaji Companion for Muse, and a tidier site.

- **Ngaji Companion for Muse:** a prompt you paste into a Muse scheduled task, at [quran.allrize.tech/agent](https://quran.allrize.tech/agent). It sends 5 verses at each prayer time, 25 a day, with read, skip and continue buttons. Copy it, or share it straight to Muse from your phone.
- **Tidier landing page.** The Update guide stays up front; the Changelog folds into one line showing the latest version, and opens from the nav. Styles and scripts are re-checked on every visit, so a new deploy never hides behind a stale browser cache.
- The reader and hooks are unchanged. Updating is safe and keeps your place.

## [0.4.1] - 2026-09-23

Updating is now seamless.

- **No more restarting the reader by hand.** After a plugin update, the next prompt swaps the old reader server for the new one, and an open reader window reloads itself to match. There's no `pkill` step anymore.
- **Know when you're behind.** The reader's "visit quran.allrize.tech for updates" link carries your version, and the site tells you whether a newer one exists.
- **Update guide and changelog timeline** in the README and on quran.allrize.tech. Release notes now come from this changelog.

## [0.4.0] - 2026-09-23

Start anywhere, find anything.

- **One search box** (press **G**): `2:255`, `18`, `kahfi`, `yasin`, `the cave`, `juz 30`, `hal 50`, or Arabic words.
- **Forgiving Arabic search.** Harakat are optional, and modern spelling finds Uthmani spelling ("الصلاة" finds the Uthmani word). Every result shows the verbatim Tanzil ayah.
- **Quick starts:** Al-Fatihah, Juz 'Amma, Al-Kahf, Yasin, Al-Mulk, and Continue. You can also browse by Surah or Juz.
- **First run asks where you'd like to start** instead of assuming 1:1.
- **`quran-turn start juz 30`**, and anything else the search box accepts, from the terminal.

## [0.3.0] - 2026-09-23

Float mode.

- **Float:** the reader becomes a small ayah card that stays on top of every app, beside your agent (Chrome, Edge or Brave).
- **Nothing moves on its own.** When the agent needs you, a strip slides into the card and you go back with **Space** when you're ready, so your reading is never cut off.
- **Smooth transitions** for the card opening and closing, the strip sliding in and out, and ayah changes.

## [0.2.2] - 2026-09-23

- A small "visit quran.allrize.tech for updates" line in the reader, showing the running version.

## [0.2.1] - 2026-09-23

- **Space reads on** after you reopen the reader following a turn. It only returns to the agent from the collapsed strip or while the agent waits on you.
- **The collapsed strip ignores the arrow keys**, so your place can't move while you can't see it.

## [0.2.0] - 2026-09-23

The reader steps aside when your agent needs you.

- **Balancing.** When the agent asks for permission or finishes, the reader collapses to a small strip and your agent's app comes to the front. It grows back when the agent resumes.
- **Back to Claude / Codex** button, and **Space** does the same.
- **A side window, never full screen** (460×740, capped at 560×900).
- "Saved at 2:157" makes the automatic save visible.
- `quran-turn switch on|off` turns the automatic switching on or off.
- **Automatic releases** from GitHub Actions whenever the version changes.

## [0.1.0] - 2026-09-23

First release.

- A quiet local reader that opens when you send your agent a prompt, pauses when it needs your permission, and saves your ayah when the turn ends.
- **Plugins for Claude Code and Codex** from one repository and one hooks file.
- **Tanzil Uthmani text, byte-for-byte**, pinned by SHA-256 and verified in the reader before anything renders.
- **Fully offline:** no account, sync or telemetry. State lives in plain JSON in `~/.quran-turn`.
- quran.allrize.tech with an optional Support button (Midtrans and Stripe).
