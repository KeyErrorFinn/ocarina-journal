# How Ocarina Journal pull requests are reviewed

Ocarina Journal (KeyErrorFinn/ocarina-journal) is an unofficial, read-only Windows and Linux companion for the Longshot PC
recompilation of Ocarina of Time: a Tauri 2 app (React + TypeScript) with Rust crates that read the player's own
saves and game files and follow the game live over a read-only local bridge. This page is the review policy for
people and for AI review sessions. Contributors don't need to read it; it explains the verdicts they get.

## The policy: build Ocarina Journal together

Contributions improve this app. Welcome larger ideas and agree on scope before implementation, then split
the work into focused pull requests that can be reviewed and merged here.

| The pull request | Where it goes | Verdict |
|---|---|---|
| A fix, a layout fix, wording, docs, a test | merged here | merge / merge-with-fix |
| A quiz question, medal, marker kind, landmark kind or save flag that follows `docs/workflows/` | merged here | merge / merge-with-fix |
| A new screen or a bigger feature that was agreed in an issue | merged here | merge / rework |
| The same without an agreed issue | an issue first | hold |
| A larger redesign, platform port or integration | an issue to agree on scope, then focused pull requests here | hold / rework / merge |
| Anything touching the rules below, CI or workflows, the bridge protocol, licensing, or new art direction | the maintainer | hold |

## Hard rules (a pull request that breaks one is a rework or a close, never a merge)

From `docs/RULES.md`:

- Nothing from the game or Nintendo in the repository: no extracted game data, saves, keys, Nintendo or *Zelda
  Notes* art, screenshots, video frames, wording or code. Game data is read at runtime only.
- The player's saves and game files are read-only. The bridge stays read-only; anything that could change game
  state needs explicit consent and the maintainer.
- Nothing listens beyond localhost, except the optional paired, read-only second screen (`docs/research/SECOND_SCREEN.md`); no network calls except the update check; no telemetry or auto-update.
- No personal details (user names in paths, save folder ids, machine details) in committed files or screenshots.
- New facts are marked [V]/[I]/[U]; nothing invented. New art is original and says where it came from.
- No agent or editor configuration that runs commands; no prebuilt binaries; no workflow edits inside a feature.

## Verdicts

- **merge**: correct, in scope, checked where it matters, nothing to change.
- **merge-with-fix**: one small mechanical change makes it mergeable (a missing CHANGELOG line, a formatting
  run, a missing [V]/[I]/[U] mark, a stray file). Say exactly what; the maintainer may push it.
- **rework**: worth having, but the author must change something real. One clear ask.
- **close**: duplicate, superseded, out of scope or against the rules. Be kind; point at what landed instead.
- **hold**: needs a maintainer decision, or must first be checked against a real game install.

## What to check

- **Game data code** (`crates/oj-gamedata`, `crates/oj-savefile`): did the author run the tests with
  `OJ_TEST_GAME`, and with which Longshot version? CI can't. Struct-member flags must be read with `flag_hash`.
- **Interface**: screenshots at a narrow and a wide window; works with no game, no bridge and no saves; uses
  the existing components and styles.
- **Art**: original, source stated, no Triforce, crests, logos, characters or text.
- **Docs**: README, `docs/research/` and CHANGELOG updated when behaviour or facts change.

## Tone

Thank the author for something specific. Ask for one thing at a time. Prefer merge-with-fix to another round.

## Review process

[SETUP.md](SETUP.md) records GitHub activation, branch protection and release gates. An AI's verdict is advisory;
only a maintainer decides to merge. Required checks and code-owner approval are enforced by GitHub settings.
