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

## Covered

All 19 categories of the reference tool: equipment, items, masks, upgrades, songs, quest items, hearts, heart
containers, heart pieces, rupees, chests, Gold Skulltulas, dungeon maps/compasses/boss keys, small keys, bosses, the Hall
of Fallen Foes, story, side quests and mini-games, plus each slot's place, age, in-game clock and save date. The golden
test compares **619 entries** and every slot's totals and info.

## Hall rematch records (found, not yet verified)

The game keeps each timed rematch as a struct flag `DreamWorld_TimeTrial.<enemy gyaml>` (for example
`DreamWorld_TimeTrial.Enemy_Stalfos`) with members `HaveRecordedTime` (Bool), `BestTimeFrame` (Float) and one more Float.
23 enemies and bosses have one. The three boss-rush trials use `DreamWorld_BossRushBestTime` and
`DreamWorld_BossrushBestTime_01/_02` (Float) with `DreamBossStage_HaveRecordedTime_BossRush[_01/_02]` (Bool). The names
came from the game's event flows and the flag list, then were confirmed by membership in the list.

**Unverified:** none of this PC's six slots holds a record, so the unit of `BestTimeFrame` is assumed to be 60 frames
a second (`HALL_FPS`). One real rematch, saved, settles it. The Bronze, Silver, Gold and Master tiers are not in the
game's files; they belong to the phone app.

## Provenance and legal

The catalogue rules follow the behaviour of Longshot's save editor (PR #1655, author mooki, unmerged); this is an
independent Rust implementation written from reading that logic and checked against its output, not a copy of its code.
Its licence and whether a port needs the same terms are **not settled** and belong with the legal review in
`RISKS_AND_LIMITATIONS.md`. If the PR changes before it merges, this crate's rules may need to follow.

## Kill counters and the daily stats

`DefeatedEnemyNum.<enemy gyaml>` (Int) is a real per-enemy kill count, not just a defeated flag. The report now carries it
as `count`, and My Journey has a "Foe Slayer" medal on the total (tiers 100, 300, 500 and 1,000, the thresholds seen in a
walkthrough of the original app; this app's own medal). The counters behind Today's Record (grass cut, pots, jumps, rolls,
sword swings, rocks lifted) were searched for in the game's flag list, its text, its event flows and its binary and
**not found by any name**, so Today's Record cannot show them. Zelda Notes itself leaves traces in the binary
(`ZeldaNote_%02d`, `ExecuteZeldaNotesSendRupee`) but no matching save flag exists under those names.

## Journal on disk and the other two modes

- The journal is saved to `%LOCALAPPDATA%\OcarinaJournal\journal.json` every ten seconds and when the game disconnects.
  A game restart no longer wipes the day. At 05:00 the finished day moves to `history.json` (up to 120 days), shown on
  the History screen.
- **Bridge off, game running:** "Turn on the bridge…" shows the exact line it would add to `longshot_env.txt`, makes a
  timestamped backup copy first, and writes only after the button press (`confirm: true`). The game must be restarted.
- **Game not running:** "Start Longshot with the bridge…" starts `bin\longshot.exe` with `HOS_CONTROL` set for that launch
  only and `--user %APPDATA%\Longshot` so it uses the real saves. That `--user` argument was found by trial (a direct start
  without it mounts a new empty folder inside the game folder); whether the Launcher passes the same is unverified.
