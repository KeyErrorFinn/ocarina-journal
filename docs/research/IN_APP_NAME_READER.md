# In-app name reader (`oj-gamedata`)

A save file stores only flag hashes. This crate names them from the player's **own** Longshot game folder, so the app
needs no Python and no external tool. Everything is read-only.

## What it reads

| Game file | Used for |
|---|---|
| `Pack/ZsDic.pack.zs` | zstd dictionaries for the game's compressed files |
| `GameData/GameDataList.Product.<n>.byml.zs` | every flag by hash, its type, enum values, defaults; the revision |
| `Mals/USen.Product.<n>.sarc.zs` (`ActorMsg/PouchContent.msbt`, `Enemy.msbt`) | what the game calls songs, enemies, chest contents |
| `Banc/<folder>/<map>_Dynamic|_Static.bcett.byml.zs` | placed chests, Gold Skulltulas, heart pieces and containers, bosses, the Hall's statues (with positions) |
| `RSDB/PouchActorInfo...`, `RSDB/Challenge...` | songs, and the story and side-quest lists |

Formats handled: zstd frames (with and without the game's dictionary), SARC, BYML (both byte orders, hash-keyed maps),
MSBT (UTF-8). The save side is `oj-savefile`.

## Verification

`crates/oj-gamedata/tests/golden.rs` compares the output with the report that Longshot's save editor (unmerged PR #1655)
makes for the same game and save. On this PC's install and slot 1 it matched on all 11 categories, **476 entries**
(id, label, area, have, of, note), and on every slot's totals. Building the whole catalogue takes about half a second.

Run it yourself (it needs your files, so it is opt-in and nothing of the game is in the repo):

```
OJ_TEST_GAME=<game folder> OJ_TEST_SAVE=<…/save/<user id>> OJ_TEST_GOLDEN=<report.json> cargo test -p oj-gamedata --release -- --nocapture
OJ_TEST_REAL=1 cargo test -p ocarina-journal --lib      # the app's own discovery and caching
```

## In the app

The Tauri backend finds the game folder (`OJ_GAME`, else the folder of the running `longshot.exe`, else the newest build
under `%USERPROFILE%\Games\Longshot`) and the saves under `%APPDATA%\Longshot\save`, builds the report once per change of
the saves, and serves it to the UI. A hand-made `report.json` (`OJ_REPORT`, or `%LOCALAPPDATA%\OcarinaJournal`) is a
fallback only when the game folder cannot be read.

## Covered and not covered

Covered: songs, hearts, heart containers, heart pieces, chests, Gold Skulltulas, bosses, the Hall of Fallen Foes, story,
side quests, mini-games. **Not** covered yet: equipment, items, masks, upgrades, quest items, dungeon maps/compasses/keys,
small keys, rupees as an entry, and the slot's place, age and in-game clock (the UI does not need them).

## Provenance and legal

The catalogue rules follow the behaviour of Longshot's save editor (PR #1655, author mooki, unmerged); this is an
independent Rust implementation written from reading that logic and checked against its output, not a copy of its code.
Its licence and whether a port needs the same terms are **not settled** and belong with the legal review in
`RISKS_AND_LIMITATIONS.md`. If the PR changes before it merges, this crate's rules may need to follow.
