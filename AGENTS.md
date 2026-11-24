# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Gemini CLI, Cursor, Copilot and others) working in this
repository. People should start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md); this file
repeats their rules in the form an agent needs and links to them for detail.

## Rules that are not negotiable

From [docs/RULES.md](docs/RULES.md):

- **Nothing from Nintendo or the game goes into the repository**: no game files or extracts (textures, maps,
  sounds, text, saves), no Nintendo or *Zelda Notes* art, screenshots, video frames, wording or code. Game data is
  read at runtime from the player's own install only. Test fixtures are hand-made or synthesised.
- **The player's game and saves are read-only.** Never write saves or game files. The bridge stays read-only
  unless the person explicitly asks and a maintainer agreed. Never bypass DRM, authentication or protection.
- **Local and private**: nothing binds beyond localhost, no telemetry, and no network calls except the opt-in update check (see `docs/RULES.md`), no personal details
  (user names, save folder ids, machine paths) in committed files.
- **Never invent** an API, offset, flag name or file structure. Mark facts [V] verified, [I] inferred or
  [U] unknown, and say how a [V] was checked.
- **New art is original.** Don't feed Nintendo images to an image model; no Triforce, crests, logos or game
  characters.
- Don't commit agent or editor configuration that runs commands (`.claude/`, `.codex/`, `.cursor/` hooks).
- Don't edit `.github/workflows/` as part of a feature change.
- Don't commit, push or open pull requests unless the person asked you to.

## Repo map

```
app/                  Tauri 2 desktop app: React + TypeScript + Vite
  src/screens/        One file per screen (Map, Rumor Hunt, Hall of Foes, Today, Journey, Ocarina, Quiz, ...)
  src/components/     Shared pieces: chrome.tsx (header, tabs, sheets), art.tsx (markers), icons, medals
  src/data/           Static content (quiz questions, medals, songs), sound playback, rewards
  src/styles.css      All styles, one rule per line
  src-tauri/          Rust backend: Tauri commands, live state, save log
crates/oj-protocol    Bridge request/response types (read-only commands only)
crates/oj-bridge      Named-pipe client with reconnect
crates/oj-journal     Turns live samples into a timeline and daily totals
crates/oj-savefile    Reader for progress.sav (flag table, murmur3 name hashes)
crates/oj-gamedata    Reads names, categories, maps, sounds and landmarks from the player's game files
crates/oj-testkit     Fake bridge and synthetic fixtures for tests
docs/research/        Investigation notes; read before changing game-data code
docs/workflows/       Step-by-step guides for common changes
```

## Commands

```powershell
# repository root
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
$env:OJ_TEST_GAME = "<Longshot folder holding romfs>"; cargo test -p oj-gamedata   # tests that need the game
# On Linux the same commands work in a shell; set the variable with: OJ_TEST_GAME=<folder> cargo test -p oj-gamedata

# app/
pnpm install
pnpm check            # tsc, ESLint, Prettier
pnpm format           # fix formatting
pnpm build
pnpm tauri dev        # run the app
```

Tests that read the game skip silently without `OJ_TEST_GAME`; say so if you couldn't run them.

## Conventions

- Rust at 120 columns (`rustfmt.toml`); TypeScript with Prettier (`app/.prettierrc.json`); CSS by hand, one
  rule per line.
- Comments say why, in plain sentences, and match the density of the surrounding code.
- Save flags are murmur3 hashes (`oj_savefile::flag_hash`). `GameData::find` sees only top-level flags; read
  struct members such as `HavePlayedEvent.*` with `sav.get(flag_hash(name))`.
- The interface resizes freely: check narrow (about 450 px) and wide windows.
- Windows and Linux are both supported. Keep host-specific paths and names in `app/src-tauri/src/platform.rs` and
  `crates/oj-savefile` (`default_data_dir`), behind `cfg(windows)` / `cfg(unix)`, and write cross-platform code
  otherwise. Facts about Longshot on Linux are in `docs/research/LINUX.md`; mark anything new [V], [I] or [U].
  You can't build the Linux app on Windows: CI is the check for it, and for library crates
  `cargo check --target x86_64-unknown-linux-gnu` works (except `oj-gamedata`, which needs a Linux C compiler).
- Follow the guide in [docs/workflows/](docs/workflows) when adding a quiz question, medal, map marker kind,
  landmark kind or save flag.

## Before you finish

Run the commands above, update the docs a change affects (README, `docs/research/`), and describe in the pull
request what you tested and with which Longshot version, or that no game was available.
