# Game state and save formats

Pinned Longshot `868f6be871f9` / `v3.0.0`; game build `e0f3ccfa`. Tags: **[C]** confirmed in source or docs read, **[I]** inference, **[U]** unverified.

**Warning on provenance.** The save-file layout below comes from the *unmerged* Longshot PR #1401 (`scripts/oot_savefile.py`, `docs/save-editor.md`, head `18e81a6c6f`, author mooki) and was **not** tested by me against a real save (no save or dump available). Its author states the layout was checked on 278 real slots and the report against a real finished save. **[C] as documentation, [U] as independently reproduced.** It is not in `main`. If it changes before merge, this document changes.

Nothing here is an N64 memory structure. The remake is a different engine whose progress is a hash-named flag store (`GameDataMgr`). N64 OoT save offsets, Ship of Harkinian structs and N64 randomizer trackers do **not** apply.

## 1. Where saves live

| Install | Path |
|---|---|
| Windows, installed launcher | `%APPDATA%\Longshot\save\` |
| Windows, portable launcher | `LongshotLauncher-data\user\save\` beside the launcher |
| Windows, older launcher / direct start without `--user` | `<game folder>\user\save\` |
| Linux / Steam Deck | `~/.local/share/longshot/save/` |

`docs/saves.md`. **[C]** Below that: `<user id>/` (the bridge `saves` reply shows `.../save/<user id>`), then `account.sav`, `option.sav`, `slot_NN/progress.sav`, `slot_NN/caption.sav`. Real sizes seen: `progress.sav` 120,724 bytes and `caption.sav` 42,239 bytes (`docs/control.md` example). **[C]**

The game offers **one save slot per profile** according to review coverage (Wikipedia). **[S]** But the on-disk layout supports multiple `slot_NN` folders, and 278 real slots were opened by PR 1401's author, so "multiple slots" means multiple profiles/imports. How the Load screen picks the "newest" is the bridge's `newest` flag. **[C]**

## 2. Save file binary layout (little-endian) **[C]** per PR 1401 header

```
0x00  u32 magic 0x01020304
0x04  u32 revision   (the GameDataList revision; a save must be read with the same list)
0x08  u32 offset of the data section;  zeros up to 0x28
0x28  flag table: 8-byte entries { u32 hash, u32 value }, grouped by type.
      An entry { 0, k } closes group k. The final entry has hash 0xA3DB7114 and
      its value is the offset of the key table.
data  values that do not fit a word: 64-bit ints, vectors, strings, arrays, binary
      (the table value is then an offset). caption.sav's JPEG picture is one of these.
keys  at the offset in the final entry, to EOF: sorted u64 keys that are true
      (the Bool64bitKey flags: one key per placed object -- chest, Gold Skulltula,
      heart piece ...), then one 0 terminator. The only part whose size changes.
```

- **No checksum and no size field.** A value changes in place; a file read and rewritten unchanged is byte-identical.
- A flag's name is `MurmurHash3_x86_32(seed 0, UTF-8 name)`. The game's `GameDataList` (a romfs file) says which hashes exist and of which type; it does **not** store the names. Names are recovered from other romfs data (item tables, actor names, placements). So the hash-to-name dictionary must be built **from the player's own romfs at runtime**, never shipped.
- Struct flags list member hashes and the hash of the flag that holds them.
- Validity checks PR 1401 applies: offsets must lie in the data section, not overlap, not touch the key table; otherwise "damaged". `revision` mismatch = "other version".
- Reading needs zstd (`.zs` romfs files) and the game's zstd dictionary from `Pack/ZsDic.pack.zs`. **[C]**

`TAIL_HASH 0xA3DB7114`, `MAGIC 0x01020304`, `TABLE 0x28`, `MAX_FILE 4 MiB`. **[C]**

## 3. Flag families seen in source (names, not offsets)

From PR 1401 `scripts/longshot_save_editor.py` and Longshot `host/*`. All **[C]** that the name pattern is used; whether each exists in every save **[U]**.

| Purpose | Flag name pattern | Type | Notes |
|---|---|---|---|
| Current map | `Sequence_CurrentBanc` | String64 | e.g. `KokiriForest_Child`. Hash `0x1d6189da`. |
| Map loading | `Sequence_IsLoadingBanc` | Bool | hash `0xef2b60c2` |
| Age | `Sequence_IsChildhood` | Bool | hash `0xcea220d3` |
| Hearts, rupees | `PlayerStatus.Life` / `MaxLife` (quarter hearts), `PlayerStatus.CurrentRupee` | Int | hashes `0x31ab5580`, `0xfbe01da1`, `0xa77921d7` |
| Last save pos | `PlayerStatus.SavePos`, `PlayerStatus.SavePosRadY`, `System_CurrentBancIndex`, `Player_Pos_For_Map`, `Player_Rot_For_Map` | vec/float/int | used by the editor's `start` command |
| Item owned | `IsGet.<ItemRow>` (e.g. `IsGet.Item_Melody_ZeldaLullaby`) | Bool | songs use these, hashes listed in `host/hos_main.c` `oot_song_flag` (Zelda's Lullaby `0x01c20002`, Epona's `0xb492ac33`, Saria's `0xd3f8bfcc`, Sun's `0x165dd1ad`, Time `0x03b3450e`, Storms `0x2b39dd4f`, Minuet `0xdc0a0b54`, Bolero `0x49041ab9`, Serenade `0x3fa63986`, Nocturne `0xc2fb95f4`, Requiem `0x802a36a8`, Prelude `0xd6320ba4`) |
| Item stock | `StockNum` of the pouch row | Int | counted items; caps set by bags/quivers/wallets |
| Chest opened | `IsTreasureBoxOpen.<placement Hash>` | Bool | readable **live** through the bridge by hash |
| Gold Skulltula | 64-bit key per placed `Enemy_Skulltula_Gold` | Bool64bitKey | **not** live-readable via bridge today |
| Heart piece | a flag of its own, or the placed `HeartPieceAnchor` key, or the chest holding it | mixed | |
| Heart container | Bool64bitKey named by the actor's 64-bit placement id | Bool64bitKey | host reads it (`hos_oot_gamedata_bool64`) |
| Dungeon info | struct `DungeonInfo.<area>` with members `IsGetMap`, `IsGetCompass`, `IsGetBossKey`, `SmallKeyNum`, `SmallKeyTotalNum` | Struct | |
| Enemy defeats | `DefeatedEnemyNum.<actor>` | Int | per-enemy kill counter; bosses and Hall of Fallen Foes entries |
| Quests | `Step_<quest>` | Int/Enum | "done at its last step (`Complete` or last step the quest lists)" |
| Pouch contents (live API in host) | actor names like `Item_DekuStick`, `Weapon_Sword_Master`, `Armor_Adult_Goron` | n/a (pouch manager) | full list in `gpu/vk/oot_cheat_items.h`; read via a guest function call, not a flag |

Mini-games: "the quests the game gives no kind ... go back to the start each time", so are listed but never count toward 100%. **[C]**

### What the saves do **not** contain **[C]** (PR 1401 docs)

- **No player name and no play time.** The Load screen shows picture, place, date, hearts, rupees; the world clock (`day 3 10:59`) is in-game time-of-day, not time played.
- No percentage. "The game itself has no percentage; this is the tool's, made from the lists above."
- A finished game can lack entries (rupee chests may re-close; Biggoron's Sword and the Giant's Knife are exclusive).

Implication: **"My Play Data"-style statistics (time played, game overs, distance, jumps, grass cut) are not in the save.** They must be accumulated by the companion from live samples/events across sessions, or come from a hook that has not been written. See `FEATURE_PARITY_MATRIX.md`.

## 4. Runtime state accessible today through the bridge **[C]**

Per `host/oot_state_tap.c` and `docs/control.md`:

| Field | Source / function | Type, unit | Meaning | Update frequency | Persists in save | Event? |
|---|---|---|---|---|---|---|
| `map` | String64 flag `Sequence_CurrentBanc` | string | the game's map name, retained across loads, `null` until Link first seen | sampled with Link's update; `status.map` refreshed every 250 ms | yes | `map` subscription event on change |
| `pos` | Link actor `+0x31c` (3 floats) | metres `[x,y,z]` | Link's actor position (during cutscenes the actor's, not necessarily the drawn pose) | sample `every` presents (default 60; tested at 6, ~10/s) | partially (`SavePos`) | no |
| `facing` | Float flag `Player_Rot_For_Map` + 180, wrapped | degrees, 0 = +z, 90 = +x | Link yaw | same | yes | no |
| `camera` | camera manager -> view, eye/at | degrees | gameplay camera yaw | same | no | no |
| `event` | `EventMgr + 104` non-null | bool | cutscene/conversation/map change playing | same | no | no |
| `loading` | Bool flag `Sequence_IsLoadingBanc` | bool | map loading | same | no | no |
| `age` | Bool `Sequence_IsChildhood` | `"child"`/`"adult"` | | same | yes | no |
| `life`, `max_life` | Int flags | quarter hearts | | same | yes | derive from diffs |
| `rupees` | Int `PlayerStatus.CurrentRupee` | int | | same | yes | derive from diffs |
| `prompt`, `music` | two String64 flags (names unknown) | strings | A-button action; current music | same | no | no |
| any watched flag | `flags:[names or 0xHASH]`, up to 64 | Bool/Int/Float/Enum(`"#hash"`)/String64/UInt | lookup order Bool, Int, Float, Enum, String64, UInt | with the sample | per flag | via `changes` |
| changed flags | `changes:true`: Bool, Int, Enum, UInt only, keyed by hash; max 32 pending per subscriber plus a `more` counter | | | full pass takes `ceil(total slots / 4096)` presents | | **yes, polled diff** |
| save folder state | `saves` command | file list, mtimes, `newest`, partial `caption` | | on request | n/a | no |

Reliability notes **[C]**: samples stop when Link is not updated (title, pause, load); not a whole-game atomic snapshot; a value that changes and changes back between scans of its slice is not reported; unreadable values are `null`. Float and String64 flags are **not** change-scanned.

## 5. Mapping of the brief's list to evidence

Legend: **Live** = readable through the bridge today. **Save** = in `progress.sav`. **Hook** = needs new Longshot code.

| Wanted field | Live | Save | Hook needed? | Evidence |
|---|---|---|---|---|
| Position, orientation | Yes | last-save only | No | `oot_state_tap.c` |
| Region/map name | Yes | Yes | No | |
| Map coordinates normalised to a map image | Raw metres yes; transform to image **[U]** (PR 1655 notes "whether the page's up is the game's north" is untested) | n/a | No (data work) | |
| Current save slot | `saves` shows newest slot; which slot is *loaded* is **not** reported **[U]** | Yes | Probably (expose loaded slot) | `docs/control.md` |
| Inventory | Partly: any `IsGet.*`/`StockNum` flag by name; pouch API exists host-side | Yes | Optional | `hos_main.c`, PR 1401 |
| Hearts, rupees | Yes | Yes | No | |
| Equipment | `IsGet.*` ownership; **equipped** state **[U]** | **[U]** | Maybe | |
| Songs learned | `IsGet.Item_Melody_*` (hashes known) | Yes | No | `oot_song_flag` |
| Quest completion | `Step_*` flags | Yes | No (needs names from romfs) | PR 1401 |
| Dungeon progression | `DungeonInfo.*` structs: **Struct kind is not in the bridge's six lookup kinds** **[I]**; members are separate flags? **[U]** | Yes | Possibly | PR 1401 |
| Collected items, chests | Bool `IsTreasureBoxOpen.*` yes | Yes | No | PR 1655 reads 7 chest flags live |
| Heart pieces, Gold Skulltulas | **No** (Bool64bitKey not exposed) | Yes | **Yes**, small: expose `hos_oot_gamedata_bool64` | PR 1655 text |
| Defeated enemies/bosses | `DefeatedEnemyNum.*` Int flags, live via flags/changes | Yes | No | PR 1401 |
| Deaths / game-over events | **No** event; could infer `life` -> 0 plus a load | **No** | Yes for reliable | none found |
| Playtime | **No** | **No** | companion accumulates; true value needs a hook (`nn::oe::GetProgramTotalActiveTime` is host uptime, not save time) | `nn_applet.c`, PR 1401 |
| Current scene | `map` | | No | |
| Event flags | any flag hash | Yes | No | |
| NPC interactions | **No** | **[U]** | Yes | none found |
| Grass cut, jumps, distance (Today's Record) | distance: integrate `pos`; jumps/grass: **no** | **[U]** | Yes, or find the game's own counters **[U]** | none found |

## 6. Strategy: reading saves without corrupting them

1. **Never write.** The companion opens save files read-only with `FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE`, copies the whole file into memory, then parses from the copy.
2. **Validate before trust:** magic `0x01020304`, revision equals what the dictionary was built from, final table hash `0xA3DB7114`, all offsets inside the data section, key table sorted and 0-terminated, total size <= 4 MiB. On failure discard the read and retry after a short delay (the game may be mid-write). Whether the game writes atomically (temp+rename) is **[U]**.
3. **Detect change** with a file watcher on the slot folder plus mtime/size poll as fallback; debounce ~500 ms; also trigger on bridge `map` events and on `loading` true-to-false, because the game saves around transitions (`HOS_OOT_TRACE_SAVES` evidence).
4. **Snapshot copies for development.** Experiments run on copies under a scratch directory. The test fixtures are synthetic (as PR 1401's tests use made-up saves). Longshot's own committed repo save `kokiri-start` is allowed only under its upstream rules (scrubbed, two-maintainer approval) and is not redistributed by this project.
5. **Never use the save editor's write paths** from the companion. PR 1401 itself refuses to write while a game runs because the game rewrites the save on quit.
6. **Version-gate:** a `revision` field different from the dictionary's means refuse and show "save from another game version".

## 7. Where the data needed for names, positions and text comes from (all local)

PR 1401/1655 read, at run time from the **player's own game folder**: `GameData` flag list, `RSDB` item tables, `Banc` placement files (`Banc/<dungeon>/<dungeon>_Static.bcett.byml.zs`, 80 maps `GameBancParam`), message files (`Mals`, 16 languages), as zstd frames with dictionary `bcett.byml.zsdic` in `Pack/ZsDic.pack.zs`. They ship **no** game-derived data. The companion must follow the same rule: a "catalogue builder" that runs on the user's machine and caches into the user's app-data folder. **[C]** for the mechanism existing, **[U]** for how much of it we can reuse (GPL-3.0; see `RISKS_AND_LIMITATIONS.md`).

Position fidelity: placements give each chest/GS/heart-piece location in metres (`where "x, y, z"`) in the same units as `pos`. PR 1655 parses those from entry descriptions. **[C]**
