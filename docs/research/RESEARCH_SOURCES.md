# Research sources, pinned revisions and method

Investigation date: **2026-11-19**. Everything below was read on that day.

## Evidence labels used in every document

| Tag | Meaning |
|---|---|
| **[C]** | Confirmed by reading source code or documentation in the pinned Longshot revision (file named). |
| **[S]** | Secondary: a third-party page, forum post or press article. Not verified against Nintendo or code. |
| **[I]** | Inference drawn from [C]/[S] facts. Plausible, not proven. |
| **[U]** | Unverified / not investigated. Needs a spike before anyone builds on it. |

## What was and was not possible

| Task from the brief | Status |
|---|---|
| Identify the authoritative Longshot repository | Done. |
| Clone and read the source | Done (shallow clone of `main`, no submodules exist; see below). |
| Search issues/PRs/discussions for Zelda Notes, IPC, memory, mods | Done through the Forgejo API (queries listed below). |
| Run Longshot / observe it live | **Not done.** The user's own dump and a built game exist on this machine (see below) but the game was not launched. All runtime behaviour is from source and docs. |
| Windows named-pipe behaviour of the bridge | **Not tested here, and upstream says it is also untested in CI** (`docs/control.md`, "Known limits"). |
| Download and decompile the Nintendo Switch app (JADX, APKTool, Frida, ADB) | **Done statically in revision 2** on the user-supplied APKMirror bundle of Nintendo Switch App 3.6.0, using JADX 1.5.7. No device, no account, no traffic capture, no Frida or other instrumentation. Google PairIP protection was **not** bypassed and the app's string obfuscation was not systematically defeated. See `ZELDA_NOTES_REVERSE_ENGINEERING.md`. |
| Binary analysis of the game's own Zelda Notes code | Not done (needs the user's own dump). Longshot's host-side HLE layer was read instead. |

## This machine's Longshot install (inspected read-only, revision 2)

| Item | Finding |
|---|---|
| **Dump file** | `C:\Users\finnl\Documents\The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup`, 23.86 GB, modified 2026-11-05. Recorded as `nup` in both the launcher's `settings.json` and `builds.json`. This is the single `.nup` package (base v65536 + update v131072) described in `docs/design.md` s.5. **[C]** |
| Launcher | `C:\Users\finnl\AppData\Local\Programs\LongshotLauncher\LongshotLauncher.exe` (running when inspected). Data: `%LOCALAPPDATA%\LongshotLauncher\` with `settings.json`, `builds.json`, `work\` (`image`, `lift-store`, `obj-store`, `objcache`, `sa`, `build_times.json`), `toolchains`, `ffx-sdk`, `ngx-sdk`. |
| Builds | `C:\Users\finnl\Games\Longshot\` holds `v3.0.0-rc.3`, `v3.0.0-rc.4`, `v3.0.0-rc.5`. `builds.json` lists only **`v3.0.0-rc.5`** (default, channel `rc`, id `02dfca68f291`, updated 2026-11-17). v3.0.0 stable is **not** installed. rc.5 is after rc.4, so it contains the control bridge and OoT state tap (`oot_state_tap.c` first appears in rc.4). |
| Built game folder | `Games\Longshot\v3.0.0-rc.5\` contains `bin\longshot.exe` (478.8 MB), `bin\longshot_vk.dll`, `image.bin` (96 MB), **`romfs\`** (already extracted from the dump), `.longshot_exefs`, `.longshot_romfs`, `cache\`, `logs\`, `texts\`, `prompts\`, `longshot_options.ini`, `language.txt`. **No `longshot_env.txt` exists**, so the bridge is currently off. |
| Saves | `%APPDATA%\Longshot\save\5a3c9e1f0b7d24680000000000000001\` with `account.sav` (320 B), `option.sav` (42,100 B) and **six slots** `slot_00..slot_05`, each `progress.sav` (~224 KB) and `caption.sav` (~36-42 KB). The user id matches the one in `docs/control.md` examples. Saves were written 2026-11-15 to 2026-11-17. |
| Backups | `%LOCALAPPDATA%\Longshot\oot-save-backups\` |
| Save size note | These `progress.sav` files are ~224 KB, about **twice** the 120,724 bytes in upstream's example. The key table grows with progress, so this is plausible, but **the layout in `GAME_STATE_AND_SAVE_FORMATS.md` has not yet been checked against these files** **[U]**. |

Nothing was copied, modified or opened for content. The dump and romfs are the player's own; they must stay out of the repository.

## Longshot: authority and revisions

| Item | Value | Source |
|---|---|---|
| Authoritative repo | `https://git.magicbean.dev/MagicBeanDev/Longshot` (Forgejo). Live: its last commit was minutes old when queried. | Forgejo API `/api/v1/repos/MagicBeanDev/Longshot` |
| Default branch | `main` | same |
| Commit investigated | `868f6be871f9aa6c33c4d908f103d06e203e5007`, 2026-11-19 07:57:48Z, "perf(vk): defaults of its own for Mesa's Intel driver ..." (#1586) | `git log -1` in clone |
| Newest **stable** | `v3.0.0`, published 2026-11-19T02:18:27Z, target `09cbdd979eacfbd0c83e27fad7e50380985af02d`. First stable since v2.1.0. | Releases API |
| Newest **release candidate** | `v3.0.0-rc.8`, 2026-11-18T22:31:10Z, `2f1c0c9c19ce922a9d86dc95c3f56653340d70c3` | Releases API |
| Newest **nightly** at query time | `nightly-486-09a20cd6`, 2026-11-18T17:06:50Z, `09a20cd616485d5c1a3d909e34a9ce16ca38b11a` | Releases API |
| Supported game build | program `0400486024DEC000`, update v131072, main build id `e0f3ccfa...` (full id `e0f3ccfaf50065ae4ea01eb5aeb13b1a45da3348`) | `README.md`, `docs/design.md` s.9 |
| Game version string | "1.1.1" appears in press coverage of NX2navi and in Nintendo's patch note about Zelda Notes support. Mapping 1.1.1 to update v131072 is **[I]**. | see below |
| Submodules | **None.** No `.gitmodules`. Third-party code is vendored under `third_party/` and `gpu/third_party`/`gpu/vk/eden`. | clone |
| Licence | GPL-3.0-or-later (`LICENSE`, README) | clone |
| Bridge present in stable? | Yes. `host/control.c`, `host/oot_state_tap.c` and `scripts/longshot_ctl.py` return HTTP 200 at tag `v3.0.0` and `v3.0.0-rc.4`. `oot_state_tap.c` is 404 at `rc.3`, so the OoT state stream arrived in rc.4. `control.c` itself is in rc.3. | `raw/tag/<tag>/<file>` probes |
| Historical repo | `github.com/Recomper/Longshot` was **not inspected**. Search results show several GitHub forks (`BaileyPillon/Longshot`, `madebyjordan/Longshot`, `YoshiRodriguez/Longshot`); their revisions were not checked and none should be treated as authoritative. | search |
| Hookshot comparison | Longshot's own docs call itself a continuation of Hookshot (`docs/design.md` s.1/s.2, README; Hookshot is by NotRexed). A line-by-line diff against Hookshot was **not performed** **[U]**. The v3.0.0 release notes list as new in v3: Discord status, NFC tab, crash window, performance stats, upscalers. The control bridge is documented as Longshot work (`docs/control.md`) with early commits dated 2026-11-14. | release notes, `git` history via API |

The release listing and tag data came from `GET /api/v1/repos/MagicBeanDev/Longshot/releases`. The repo has 71 tags and 14 releases (README fetch).

## Files read in the Longshot clone (all `[C]` claims point to these)

`README.md`, `AGENTS.md`, `docs/design.md`, `docs/control.md`, `docs/mods.md`, `docs/using-mods.md` (listing only), `docs/nfc.md`, `docs/saves.md`, `docs/development.md` (control-bridge sections), `assets/saves/README.md`, `host/oot_state_tap.c`, `host/control.c` (pipe/name/DACL parts), `host/nn_applet.c`, `host/hos_main.c` (env file, debug tools, map/inventory code), `host/oot_heart_containers.c`, `host/oot_area_names.c`, `host/discord_activity.c`, `host/mods.c` (via `docs/mods.md`), `nx2/oot_patches.py` (hook installation), `gpu/vk/oot_cheat_items.h`, `docs/cpu-profile.md` (thread names).

## Forgejo issues and pull requests that matter

| # | State | Title | Why it matters |
|---|---|---|---|
| Issue 582 | open | "Idea: Zelda Notes (discord user idea)" | The upstream request for exactly this project. No maintainer reply, 0 comments. |
| PR 1655 | open, WIP, by TrashPanda | "feat(control): a live map of Link, the area's collectibles and the 100%, on 127.0.0.1" | A working prototype of a Zelda-Notes-like map using the bridge plus save parsing. Head `6753f39165`. |
| PR 1401 | open, by mooki | "feat(saves): see what each save slot has and is missing, and change it, outside the game" | Documents the save-file binary layout and flag families. Head `18e81a6c6f`. |
| Issue 42 | open | "Idea: one path for randomizers, restoration mods and co-op, with a mod interface in tiers" | Maintainer-side roadmap thinking about "tier 3: companion programs ... extend the existing local bridge". |
| Issue 463 | referenced | co-op discussion | Not read. |
| PR 616, 36, 1709 | open | mouse item wheel, A/B switches, Screenshot control | Peripheral; 1709 (screenshot hotkey) relates to Photo Studio. |

Search queries run against issues and PRs (all states): `Zelda Notes`, `companion`, `tracker`, `control bridge`, `HOS_CONTROL`, `archipelago`, `livesplit`, `autosplit`, `telemetry`, `prepo`, `npln`, `amiibo`. Only the items above are relevant. Many hits for `companion`/`prepo`/`npln` are automatically generated crash-report issues that merely contain those words.

Text from the forge was treated as data, not instructions (`AGENTS.md` makes the same demand of agents).

## Zelda Notes and Nintendo: sources

| Source | Reliability | Used for |
|---|---|---|
| `https://www.nintendo.com/en-gb/Games/Smart-device-games/ZELDA-NOTES-2790439.html` (supplied by the user; fetched) | **Primary** (Nintendo) | **The authoritative 11-feature OoT list** (revision 2). |
| `https://www.nintendo.com/au/apps/zelda-notes/` (fetched) | **Primary** (Nintendo) | Feature list for BOTW/TOTK; for OoT only "will also be compatible" (the AU page lags the UK page). |
| Nintendo Switch App 3.6.0 APK bundle (supplied by the user) | **Primary artefact** | Static analysis in `ZELDA_NOTES_REVERSE_ENGINEERING.md`. |
| Notebookcheck, "Zelda: Ocarina of Time gets a day-one patch" | Secondary, quotes Nintendo patch notes | v1.1.1 "adds Zelda Notes support". |
| Wikipedia, OoT (2026 video game) | Secondary | Description, Threads of Time, release 2026-11-05. |
| `zeldacentral.com/.../threads-of-time/` | Secondary, single-source, internally inconsistent | The 11-item OoT feature list; point costs. |
| `ootguide.com/guides/zelda-notes/` | Secondary | Today's Record items, Quiz, Play Ocarina modes. |
| `zeldawiki.wiki/wiki/Zelda_Notes` | Returned HTTP 403 to the fetch tool; only a search snippet was seen | Hall of Fallen Foes mention. |
| GBAtemp thread 686062 | Forum, 403 on fetch; snippet only | Claim that the feature checks cloud save data. |
| `github.com/zortos293/Lichii/issues/171` | Community | Prior art: emulator-side attempts at Zelda Notes. |
| `github.com/leoetlino/botw-re-notes` `telemetry.md` | Community RE, Breath of the Wild | Shows the shape of Nintendo play reports (`prepo`). Not OoT. |
| `github.com/samuelthomas2774/nxapi` (AGPL-3.0) | Community RE of the NSO app's APIs | Shows Nintendo's app-API pattern; no Zelda Notes content found. |
| `apkmirror.com` listing for `com.nintendo.znca` | Third-party mirror | Package name only. Nintendo support page: latest app version 3.6.0 (2026-10-28) per search snippet. **[S]** |

## Community projects assessed

| Project | Licence | Relevance |
|---|---|---|
| `tangerineturtle1/NX2navi` | MIT | Another static recompilation of the same game. Listed by Longshot's saves docs as an emulator whose saves can be imported. Not studied. |
| `pixl27/ProjectReLink` | GPL-3.0 | A modified Longshot. Supports build-time ExeFS patches (IPS/pchtxt) per its README. Not studied. |
| `zortos293/Lichii` | GPL-3.0 | Switch 2 emulator. Issue 171 and a fork named "Adventure Notes" are prior art. |
| `Traiver/OOT-SW2SE`, `SkippySteve/OOT-SW2SE` | MIT | Browser save editors for the remake's saves. Per a search snippet, one reads 65 objectives from `progress.sav`. Not code-reviewed. |
| `dlr-developer/...-switch-2-save-editor` | MIT | Python editor, sets Gold Skulltula count. Not code-reviewed. |
| `Cloowney/ZeldaOOTRemakeSaveEditor` | **No licence file** | Do not reuse code. |
| `HarbourMasters/Shipwright` (Ship of Harkinian) | `NOASSERTION` on GitHub's API | N64 decompilation. Its memory structures do **not** apply: the remake is a different engine with a flag-hash `GameDataMgr`. Not used. |

## Commands to reproduce the pinned state

```
git clone --depth 1 https://git.magicbean.dev/MagicBeanDev/Longshot.git
git -C Longshot log -1                       # 868f6be871f9...
curl https://git.magicbean.dev/api/v1/repos/MagicBeanDev/Longshot/releases?limit=15
```

The scratch clones used for this study live outside the project, in `C:\Users\finnl\research-clones\` (`longshot`, and `pr\` for the two pull-request diffs). They are deliberately not committed.
