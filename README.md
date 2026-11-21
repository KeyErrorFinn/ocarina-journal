<p align="center"><img src="assets/icon.svg" width="96" height="96" alt="Ocarina Journal icon"></p>

# Ocarina Journal

An unofficial, read-only **Windows companion app** for the native PC recompilation of
*The Legend of Zelda: Ocarina of Time* ([Longshot](https://github.com/Recomper/Longshot)). It is a fan-made
take on the idea behind Nintendo's *Zelda Notes*: a pocket journal that shows what you have found, what you
have missed, and how your day of play went. It runs on your own PC, from your own saves and your own game files.

> **Not affiliated with, endorsed by, or connected to Nintendo or the Longshot project.**
> Ocarina Journal contains no game files, keys, Nintendo assets or Nintendo source code. All artwork in the
> app is original. "Zelda", "Ocarina of Time" and related names belong to Nintendo.

**Status: early, working prototype.** It runs and reads real saves, but expect rough edges. Several details
are still unverified; they are listed under [Known gaps](#known-gaps).

## What it does

The app is a phone-shaped window with twelve tiles:

| Tile | What it shows |
|---|---|
| **Map** | The game's own world, area and dungeon-floor maps (read from your game folder), with the chests, Gold Skulltulas and hearts you have and haven't found, exits, floors, and Link live |
| **Rumor Hunt** | Rumours about landmarks in your own game (gossip stones, grottos, cows, frogs and more): go there with the bridge on and tap Found! for points, then spend them on ocarinas |
| **Hall of Foes** | Enemies and bosses defeated, kill counts, Hall rematch records and the three trials, locked until the save opens the Hall |
| **Today's Journal** | What each save gained today (works without the bridge, even with the app closed), plus a live timeline and stats with the bridge on |
| **My Journey** | Medals up to Master, your picture, and what you are known for |
| **Slot Compare** | Your save slots side by side |
| **History** | Past days and what their saves gained, kept on your PC (a day runs 05:00 to 04:59) |
| **Tapestry** | The game's own Threads of Time tapestry (read from your game folder), each section woven, in silhouette or empty to match your save's quests |
| **Photo Album** | Shown as unavailable: the PC version has no photo capture for it to use |
| **Ocarina** | Plays the game's own ocarina sounds (read from your game files) with the remake's buttons, ♭/♯ bends, songs on a staff with Guided Play and the game's own recordings, and your scores shared as QR cards |
| **Quiz** | Egg (20) and Cucco (30) levels and the Cojiro Challenge; most questions are made from your game's own item and enemy descriptions and world map |
| **amiibo** | Shown as unavailable: a PC has no NFC reader |

It has three modes:

- **Live** – the game is running with Longshot's control bridge on; data updates as you play.
- **Bridge off** – the game is running without the bridge. Saved data still works, and the app can offer to
  turn the bridge on (after showing you exactly what it would change and asking first).
- **Offline** – the game isn't running. The app reads your save files.

The names, categories, totals, map pictures and tapestry come from your own installed game files and saves, read by the app
itself on your PC (see `docs/research/GAME_MAPS.md`). Nothing from the game is in this repository, and nothing is
uploaded anywhere.

## Safety and privacy

- **Read-only by default.** The bridge client only sends the read-only `status` and `subscribe` requests. The
  protocol type in `oj-protocol` has no write commands.
- **Your saves are never modified.** Save files are only read.
- **Local only.** The bridge is a same-user Windows named pipe, not a network port. The app does not open any
  listening socket and talks to no server.
- **Explicit consent for changes.** The two actions that change anything (adding `HOS_CONTROL` to
  `longshot_env.txt`, or starting Longshot with the bridge on) show what will happen and need a button press.
  The first makes a backup copy of the file before writing.
- **No circumvention.** The project does not touch Nintendo's servers, accounts, tokens or app protections.

## Requirements

- Windows 10/11
- A working Longshot install with its own game files (you supply these; this project doesn't and can't)
- To build: [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io), and the
  [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for Windows (WebView2, MSVC build tools)

There are no release builds yet; build from source.

## Build and run

```powershell
git clone <this repository>
cd <repository folder>

cd app
pnpm install
pnpm tauri dev        # development window with hot reload
pnpm tauri build      # installer under app/src-tauri/target/release/bundle
```

To use Live mode, start Longshot with the bridge on. The app can do this for you from its Home screen, or you
can set `HOS_CONTROL=longshot` in the environment or in `longshot_env.txt` yourself. The app looks for the game in
the usual Longshot folders and also picks up the folder of a running `longshot.exe`.

## Repository layout

```
app/                  Tauri 2 desktop app (React + TypeScript + Vite) and its Rust backend (app/src-tauri)
crates/oj-protocol    Bridge request/response types (read-only commands only)
crates/oj-bridge      Named-pipe client with reconnect
crates/oj-journal     Turns live samples into a timeline and daily totals
crates/oj-savefile    Reader for the game's save files (progress.sav flag table)
crates/oj-gamedata    Reads names, categories and maps from your game files (zstd, SARC, BYML, MSBT, BNTX)
crates/oj-testkit     Fake bridge and recorded fixtures for tests
docs/research/        Investigation notes, formats, architecture, risks and open questions
```

Run the tests with:

```powershell
cargo test --workspace
```

Two optional tests use a real install and are skipped unless you set `OJ_TEST_REAL=1` (and the related
variables described in the test files).

## Known gaps

Honesty about what hasn't been confirmed is part of this project. Open items:

- **Hall record times**: the unit of the saved best time is assumed to be 60 frames per second. No save with a
  recorded rematch has been checked yet.
- **Map details**: the Water Temple's water level and dungeon room states aren't read yet; the map shows the first
  of each (see `docs/research/GAME_MAPS.md`).
- **Tapestry states**: when the game shows a section as a silhouette rather than empty is our reading (once its
  quest has started), and the bottom band is assumed to appear when Ganon is defeated. Neither has been checked
  against the game (see `docs/research/GAME_MAPS.md`).
- **Daily stat counters** (grass cut, jumps, and similar): no matching save flags were found, so Today's
  Journal doesn't show them.
- **Launcher behaviour**: starting `longshot.exe` directly needs `--user <your Longshot data folder>` to use your
  real saves. Whether the official Launcher does the same hasn't been confirmed.
- **Screenshots in the timeline**: not available; capturing the game would need a write-capable command
  with its own consent step.
- **Online features**: global comparison, leaderboards and amiibo depend on Nintendo's services or the console
  and are not possible here.

See `docs/research/RISKS_AND_LIMITATIONS.md` and `docs/research/IN_APP_NAME_READER.md` for the details.

## Help wanted

If you own the real *Zelda Notes* in the Nintendo Switch app and are willing to help, the most useful things
are the ones nobody can derive from the game files:

- Tell us how the **daily stats** and **medal tiers** behave (what counts, and at which numbers a tier changes).
- Confirm the **Hall of Fallen Foes** record display (the time format of rematch records).
- Share **your own descriptions or notes** of screens, wording and flow. Please do **not** send Nintendo's
  artwork, screenshots of copyrighted art, or anything that would require bypassing the app's protections;
  we can't use those.

Players of the PC recompilation can also help by running the app against their saves and reporting what looks
wrong. Open an issue and say which game revision and Longshot version you used.

## Legal

This is an unofficial fan project. It is not licensed by Nintendo. The code is declared **GPL-3.0-or-later**
in the Cargo manifests. Parts of the category rules were ported from an unmerged Longshot pull request; the
licensing of that port still needs review. See `docs/research/RISKS_AND_LIMITATIONS.md`. Nothing here is legal
advice.

Created in [T3 Code](https://t3.codes).
