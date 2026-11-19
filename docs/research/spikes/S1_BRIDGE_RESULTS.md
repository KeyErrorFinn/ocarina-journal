# Spike S1: control bridge on the user's Windows machine (2026-11-19)

Build: Longshot `v3.0.0-rc.5` (source `013b1d3a`), RTX 5070 Ti, Windows 11. Game started with `HOS_CONTROL=zn-spike` set **only in the launched process's environment** (no config file written) and `--user` pointing at a scratch copy of the six real save slots. Real saves under `%APPDATA%\Longshot\save` were not touched (slot_01 mtime unchanged). A read-only Python client subscribed to `oot` and `map` events (`every:6`, `changes:true`). A second connection drove input (`press`, `stick`, `shot`) to load a save and walk: this used the bridge's write-capable commands, on a scratch copy, at the user's request. Raw logs are local (`C:\Users\finnl\research-clones\spike\`), not committed.

## Results

| Question | Result |
|---|---|
| Does the Windows named pipe work? | **Yes.** `\.\pipe\zn-spike`; two simultaneous clients (`clients:2` in `status`); 0 EOFs, 0 I/O errors, 0 bad JSON over ~14 minutes. **GATE 1 passed** for this build. |
| Handshake | `status` reported `protocol:1`, `version:"v3.0.0-rc.5 (source 013b1d3a)"`, `renderer:"NVIDIA GeForce RTX 5070 Ti (Vulkan, native)"`. While loading: `state:"boot"`, `game:null`, `saves` replied `unavailable` ("the game has not opened its saves yet"), as documented. |
| Sample rate | 2,027 `oot` samples; gap median **6 frames**, p95 6, 100% of gaps <= 12 except loads (max 210 frames); `more` never > 0; `pos` never null. At 60 fps that is ~10 Hz. |
| Change-scan latency | The game logged `control: oot changes scan: Bool=22584 Int=2518 Enum=260 UInt=194 slots=25556 slice=4096 presents=7`. A full pass = **7 presents (~117 ms at 60 fps)**. Resolves risk T2. |
| `map` event | Fired correctly: `KakarikoVillage_Adult_Alternative` -> `DeathMountainTrail_Adult` on walking through the exit. |
| Live fields | Adult Link: `life` 56 / `max_life` 56 (14 hearts, matches the HUD), `rupees` 944, `pos` metres, `facing`, `camera`, `prompt`, `music` (`BGM_KakarikoVillage_Adult`, then `BGM_HyruleField` on Death Mountain Trail). |
| `changed` flags | 16 distinct hashes changed in the session (loading a save, a map change, NPC proximity). Three were named by hashing every string in the player's own `Logic`/`RSDB`/`GameData`/`Game`/`Component`/`AI`/`Life`/`Env` data: NPC-proximity flags in Kakariko. **13 stay unnamed.** |
| Two once-per-second counters | `0xe53eb6d1` (792, 793, ...) and `0xe573f564` (86804, 86805, ...) rose by 1 every 60 frames (132 samples). They look like play-time-style counters but **are not named in the scanned data and I did not verify what they are.** Candidate names tried (PlayTime variants etc.) did not match. Do not assume play time is available until identified. |
| Save layout | Checked on all six real slots: magic `0x01020304`; revision `2982123` = the `GameDataList.Product.110.revision.txt` value; flag table of 11,958 entries; data offset 95,704; tail hash `0xA3DB7114` present; key table sorted and 0-terminated with 383-387 true keys; sizes 223,968-224,512. **The documented layout holds on real files.** (The ~224 KB size vs upstream's 120 KB example is explained by the table size.) |
| Autosave | The Load screen lists several entries labelled **Autosave**, so the game autosaves into slots. Walking and one map transition did **not** change any `progress.sav` mtime in 14 minutes, so autosave is not triggered by every transition. Cadence still unknown. |
| Screenshots | `shot` works and returns the game picture with HUD at 1280x720. |
| Game-driven start-up | Title -> Continue -> Load -> confirm took 3 `A` presses (via `press`); load to play ~18 s. |

## Not tested

Opening a chest, rupee pickups, taking damage, killing an enemy, game over, saving from the menu, `flags` watch values for named flags (`PlayerStatus.*` hashes were subscribed but values were read from the standard fields), Bool64 keys, a read-only scope (does not exist). No frame-time A/B was run.

## Effect on the plan

- GATE 1 passed (this build, Windows, one machine).
- Risk T2 (scan latency) resolved: ~117 ms.
- Save-layout risk T8 reduced: verified on real files.
- New open item: identify the two 1 Hz counters (candidate play-time source).
- Chest/enemy/rupee/damage event attribution remains to be demonstrated; the player can do this in a normal session with the same client.


---

# Run 2: combat session (same day)

Real saves were first backed up (14 files, SHA-256 identical) to `C:\Users\finnl\Documents\Longshot-save-backups\save-20261119-094246`, and verified **still identical after the session**. The game again ran on a fresh scratch copy via `--user`. The bridge drove input (`press`, `stick`, `sequence`) and `teleport` (a debug write command) to reach enemies; 4,122 `oot` samples, 0 errors, 3 simultaneous clients.

## What happened

- Dodongo's Cavern (1F): one hit from something (56 -> 53 quarter-hearts), no kill; a plant-like creature did not respond to the sword.
- **Forest Temple, first courtyard: two Wolfos.** Combat began at frame ~21,600. Link was reduced from 51 to 0 quarter-hearts over ~10,000 frames (about 2.8 minutes) in **2-quarter (half-heart) steps**. Blocking with the shield slowed the damage; my sword attacks, sent blind through `press`, did not land a kill. **No monster was defeated**, so no `DefeatedEnemyNum.*` change was observed. I did not manage a successful fight; this was a failed one.

## Findings

| Finding | Evidence |
|---|---|
| **Combat is visible**: `music` switched from `BGM_ForestTemple` to **`BGM_EnemyBattle`** when the Wolfos engaged and stayed until the end. Usable as an "in combat" signal. | status samples |
| **Damage is observable and exact**: every hit appears as a `life` decrease (and a `changed` entry for `PlayerStatus.Life`, hash `0x31ab5580`), 37 changes in the run. Hits here cost 2 quarter-hearts each (1 from a small hit). | `analyze.py` over the log |
| **Death is an event-flag sequence, not a map load.** At frame 31,754 `life` reached 0 and `event` became `true`; at frame 32,066 `life` was **20** (5 hearts) with `event` still `true`; `state` stayed `play`, `loading` stayed `false`, and the map did **not** change. Link was revived in place (the cause, for instance a bottled fairy, is **not established**). | samples around frames 31,700-32,100 |
| **This contradicts my earlier DeathEvent heuristic** ("life zero then a map load"). Fixed in `COMMUNICATION_PROTOCOL.md` II.8: detect `life == 0` with `event == true`, and treat a recovery to `life > 0` without a map change as a revival, not a game over. A true game over (with a load or Continue screen) was **not observed**. | |
| `event` true marks the death/revival cutscene; this overlaps with other cutscenes, so `event` alone is not a death signal. | |
| **Autosave on map change (probable):** the scratch slots `slot_00` and `slot_02` were rewritten at 09:44:51 and 09:47:21, minutes after the game started, around the teleports into Hyrule Field and Dodongo's Cavern; the other four slots were untouched. Consistent with autosaving on a map load into a rotating slot. Cause not proven (teleport vs. normal transition not separated). | scratch-slot mtimes |
| Flags that changed at combat start/end (all unnamed): a group of four set to 1 at frame 20,751 when entering the temple (`0x3c862c6c`, `0x3f6180a1`, `0xf41eeea6`, `0x5db3278e`), one at frame 21,486 shortly before the first hit (`0x33763a58`), one at frame 23,942 (`0x16bf1503` -> 0), and an enum at frame 32,006 (`0xb80c70a8`) near the death. Meanings are **unknown**. | |
| 43 distinct hashes changed in the run, 2 of them the 1 Hz counters. | |

## Lessons for tooling

- Blind input injection is enough to load a save, walk and take damage, but not to win a fight. Anything needing the game to be *played* (kills, chests, saves) is best done by the user, with the same client logging.
- The camera is not always third-person behind Link (a first-person-like view appeared in the cavern), so world-direction navigation from `pos` and `camera` was unreliable near walls.
- `teleport` into dungeons works (`accepted: true`) and takes ~15-20 s including the load.
