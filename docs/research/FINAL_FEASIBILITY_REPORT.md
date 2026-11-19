# Final feasibility report: a Zelda-Notes-style PC companion for Longshot

Date: 2026-11-19. Companion documents are in this folder. Tags: **[C]** confirmed in source/docs, **[S]** secondary, **[I]** inference, **[U]** unverified.

## 1. Executive summary

**Feasible, with a narrower promise than "recreate Zelda Notes".** A Windows companion that shows Link live on a map, tracks collectibles and quests, builds Today's Record and play statistics, and bundles a virtual ocarina, a quiz and a photo editor can be built on **Longshot v3.0.0 as it ships today**, using a mechanism the brief did not know existed: Longshot's opt-in, same-user, local **control bridge**, which already streams Link's position, map, age, hearts, rupees and any named game flag, and lists saves. A prototype map built on it is already open upstream (PR #1655). **[C]**

What cannot be recreated is anything that depends on Nintendo's servers: global statistics, Nintendo's Gossip Quest content and points, the app-side amiibo bonus, and the official app's data. These can only be local approximations, and must be labelled as such. **[C]/[I]**

Two limits on this report matter more than the rest:

1. **The APK was analysed statically only (revision 2).** Result: the phone app contains **no Zelda Notes code or content**; it is a generic host that opens Nintendo-hosted web content in a WebView, so the Zelda Notes UI and protocol cannot be recovered from the APK. Google PairIP protects a few methods and I did not bypass it; the web content and the game-to-server upload remain unobserved. The official feature list is now taken from Nintendo's own UK page (11 features). **[A]/[N]**
2. **I did not run Longshot.** Everything about the bridge is from source and documentation. Upstream itself says the Windows pipe is untested. A real Windows test is the first thing to do. **[C]**

**Recommendation:** build Option F (hybrid): control-bridge live stream + read-only save parsing + a companion-owned history database, with small additive upstream patches; Tauri 2 + React + TypeScript + Rust + SQLite + pnpm. Roughly **31-43 person-weeks** for the full local scope; a useful live-map MVP in about 8-10 person-weeks.

## 2. Confirmed findings

1. **Authoritative Longshot repo** is `git.magicbean.dev/MagicBeanDev/Longshot` (Forgejo); the GitHub history is not authoritative. GPL-3.0-or-later. No submodules. **[C]**
2. **Versions.** Stable `v3.0.0` (2026-11-19, `09cbdd979eac...`), newest RC `v3.0.0-rc.8` (`2f1c0c9c19ce...`), newest nightly seen `nightly-486-09a20cd6`. Investigated `main` `868f6be871f9` (2026-11-19). Game: program `0400486024DEC000`, update v131072, build `e0f3ccfa`. **[C]**
3. **Architecture.** Static AArch64-to-C recompilation, Horizon/NVN2 reimplemented natively, Vulkan renderer; services are mostly offline stubs. **[C]**
4. **A control bridge ships in v3.0.0.** Named pipe on Windows (`\\.\pipe\<name>`), Unix socket on Linux; never TCP; same-user DACL; newline-delimited JSON protocol 1, additive; enabled by `HOS_CONTROL`, which `longshot_env.txt` may set. **[C]**
5. **`oot_state_tap.c`** reads, on Link's update, map, position (m), facing/camera yaw, event/loading, age, life, max life, rupees, prompt, music, plus any flag by name hash (Bool/Int/Float/Enum/String64/UInt) and polled changes for Bool/Int/Enum/UInt. Addresses are hard-coded for one game build. **[C]**
6. **There is no existing Zelda Notes service integration in Longshot.** The game has a gRPC (`nn.npln.*`) client and requests a network-service-account token; Longshot makes those fail so the game stays offline. `PlayReport` saves are dropped. The title menu has a "ZELDA NOTES Setting" entry. That the gRPC channel is Zelda Notes' is **[I]**. **[C]** facts
7. **Mods are RomFS file replacement only**; no host code, no plugin API; native modules are a proposed "tier 4, later" (issue #42). **[C]**
8. **Saves**: `account.sav`, `option.sav`, `slot_NN/{progress.sav,caption.sav}`; hash-keyed flag table; sorted 64-bit key set at the end; no checksum; **no player name or play time**. Documented in unmerged PR #1401. **[C] as documentation**
9. **Gold Skulltulas and most heart pieces are 64-bit keys the bridge does not expose;** chests and enemy-defeat counters are readable live. **[C]**
10. **Prior art exists.** Longshot issue #582 asks for this feature; PR #1655 prototypes a live map and collectibles; Lichii issue #171 and community save editors cover the same ground. **[C]/[S]**
11. **The bridge gives a same-user client full control** (input, quit, files via `shot`); there is no read-only scope. **[C]**

## 3. Latest Longshot version investigated

`main` `868f6be871f9aa6c33c4d908f103d06e203e5007` (2026-11-19 07:57:48Z), stable `v3.0.0` (target `09cbdd979eacfbd0c83e27fad7e50380985af02d`). The bridge and OoT state tap are present at `v3.0.0` and `v3.0.0-rc.4`; `oot_state_tap.c` is absent at `rc.3`. See `RESEARCH_SOURCES.md`.

## 4. Official Zelda Notes feature inventory (Ocarina of Time)

From Nintendo's UK page **[N]**, eleven features: **Map** (missed Pieces of Heart and chests incl. dungeons; hide unvisited places), **Gossip Quests** (in-game snapshot hints; points for sheet music; rupee-for-hint), **Hall of Fallen Foes** (bosses, personal records, medals, leaderboard), **Today's Record** (chronological, automatic screenshots, daily stats), **My Play Data** (milestone medals), **Global Play Data**, **Photo Studio**, **Threads of Time+** (journey tapestry with cutscene replay), **amiibo** (daily items, 5 scans = 1 extra), **Play Ocarina** (Free, Guided, Demo; QR sharing), **Ocarina of Time Quiz** (2,000+ questions, two difficulties, 20 rupees per extra attempt). Details: `ZELDA_NOTES_REVERSE_ENGINEERING.md` s.6.

Requirements: the Nintendo Switch App with a Nintendo Account and game v1.1.1+ **[S]**; no Switch Online membership **[N]**. Reports of needing cloud save data and being online remain **[S]**.

## 5. Feature parity assessment (summary)

| Feature | Class | Notes |
|---|---|---|
| Interactive map (incl. hide-unvisited) | D + M + R | Link/trail/chests live now; live Skulltulas need `flags64`; no distributable map art. |
| Collectible tracking | D + M | Save-based; chests live. |
| Gossip Quests | L | "Location Quests": own screenshots, proximity check, local points. Not identical. |
| Hall of Fallen Foes | D | `DefeatedEnemyNum.*`. |
| Today's Record | L (+R/M) | Time, enemies, rupees, hearts, distance derivable; grass cut, jumps, game overs have no source yet. |
| My Play Data | L | Saves hold no play time; only since installation. |
| Global Play Data | N | Optional community service possible; different thing. |
| Photo Studio | L | `shot` + original editor. |
| Threads of Time+ | D (tapestry) / R (cutscene replay, write-capable, deferred) | Cutscene replay needs a way to start story events; not in the bridge. |
| amiibo | in-game D (Longshot NFC); app bonus N | |
| Play Ocarina | D standalone, M drive game | |
| Quiz | L | Original questions. |

Detailed per-feature requirements, data, implementation and testing: `FEATURE_PARITY_MATRIX.md`.

## 6. Recommended integration method

Option F: **control bridge (live) + read-only save parsing (truth) + companion SQLite history**, plus small upstream PRs (`flags64`, build/slot in `status`, discrete events, read-only connection scope, optionally a `PlayReport` tap). Rejected: private fork, mods, mock of Nintendo's backend, external memory reading. Comparison table and reasoning: `INTEGRATION_OPTIONS.md`.

Read-only by default; any write-capable capability (driving ocarina input) is a separate, consented toggle; saves and guest memory are never written.

## 7. Recommended desktop stack

Tauri 2 + React + TypeScript + Vite + Rust (`tokio`, `serde`, `rusqlite`) + pnpm: appropriate; no alternative offers a meaningful advantage. Details and rejected alternatives: `COMPANION_APP_ARCHITECTURE.md` s.1.

## 8. Proposed architecture

Single Tauri process with Rust tasks (discovery, bridge, save watcher, catalogue, event processor, store) and a React UI; crates `zn-protocol`, `zn-bridge`, `zn-savefile`, `zn-gamedata`, `zn-core`, `zn-store`, `zn-discovery`, `zn-testkit`; local-only data, no network by default. Data-flow, lifecycle matrix, persistence and reconciliation rules: `COMPANION_APP_ARCHITECTURE.md`. Wire and schema contract: `COMMUNICATION_PROTOCOL.md`. UI: `UI_UX_SPECIFICATION.md`.

## 9. Implementation roadmap

Phases 0-7 with objectives, prerequisites, files, tasks, risks, tests and acceptance criteria in `IMPLEMENTATION_ROADMAP.md`. Critical path: P0 spikes, P1 PoC, P2 game state, P3 foundation, P4 core features, P6 reliability, P7 distribution; P5 features parallel.

## 10. Estimated development effort

| Scope | Effort |
|---|---|
| Phase 0 (validation) | 2-3 pw |
| MVP: live map + collectibles + connection (P0-P3 + part of P4) | ~8-10 pw |
| Full local scope (P0-P7, no community service) | 31.5-43 pw |
| Community statistics service | 6+ pw extra, recommended deferred |

One developer: about 8-10 months for the full scope; a team of three: about 4-5 months. **[I]**

## 11. Major technical obstacles

1. **Windows pipe is untested upstream** and decides whether live data works at all (GATE 1).
2. **Change-scan latency is unmeasured** (4096 slots per present across four tables).
3. **Build-specific addresses** make the bridge fragile across game updates.
4. **Names must come from the player's own romfs**; hashes are not named in saves or flag lists; name recovery completeness is unproven.
5. **Missing data sources** for several Today's Record metrics and for play time.
6. **Map art:** nothing distributable; calibration across 80 maps.
7. **Legal exposure** around Nintendo IP, trade dress, APK analysis and song data.
8. **Maintainer alignment:** no reply to issue #582 yet; PRs #1401 and #1655 unmerged.
9. **No read-only scope** on the bridge: our "read-only" is client discipline until upstream adds it.

## 12. Unresolved research questions

1. What do the live Zelda Notes **web screens** look like and do? The APK cannot show them. A screen recording the user makes on their own console save answers this without touching any protocol.
2. Is the in-game `nn.npln` gRPC channel Zelda Notes' upload path, and what are its method names? (A string search in the user's own dump, which is on this machine.) The APK string `nplnUserId` that revision 1 thought related is unrelated.
3. Does OoT send `PlayReport`s, with which events and fields? Are they readable from `Save`? (S3)
4. Does the game keep counters for grass cut, jumps, distance, play time, game overs? (S2)
5. How often and how (atomically?) does the game write saves? (S4)
6. Is the guest memory window's host base fixed? (irrelevant to the chosen design; matters only to rejected option D)
7. Which slot is loaded? Can upstream expose it and the game build id?
8. Do Gold Skulltula and heart-piece keys live in the same `Bool64bitKey` container as heart containers? (**[I]**)
9. Does the bridge work from `longshot_env.txt` with a bare pipe name on the launcher-driven Windows layout?
10. Is a Linux/Steam Deck build of the companion worth it?
11. Maintainers' stance on companion features and on a read-only scope.
12. Legal: acceptability of runtime reading of the user's own romfs, melodies, naming, and any APK analysis.
13. Does ProjectReLink/NX2navi expose a compatible bridge? (not studied)

## 13. Explicit next step

This machine already has what S1 needs: a built **v3.0.0-rc.5** (default build; it includes the bridge), the dump, and six real save slots. **Run Phase 0 spike S1:** with that build, add the single line `HOS_CONTROL=zn-spike` to `longshot_env.txt` beside the game, start the game, and connect a minimal Rust client to `\\.\pipe\zn-spike` that sends `status` and then `subscribe {"events":["oot"],"every":6,"changes":true,"flags":["PlayerStatus.Life","PlayerStatus.CurrentRupee"]}`. Record a 30-minute session that includes opening a chest, collecting rupees, taking damage, changing map and saving, and capture the game's `control: oot changes scan:` log line. This takes about a day, proves or kills the live channel (GATE 1), measures the one unmeasured number (scan latency), and costs nothing if it fails. In parallel, open an RFC issue upstream referencing #582, #42 and #1655 with the Part III extensions.

Do **not** start the full application before S1 and the flag-name census (S2) are done.

## 14. Update: spike S1 was run (see `spikes/S1_BRIDGE_RESULTS.md`)

On the user's machine with `v3.0.0-rc.5`: **GATE 1 passed.** The Windows named pipe worked for ~14 minutes with two clients, no errors; `oot` samples arrived at ~10 Hz (2,027 samples, median gap 6 frames); `map` events fired; a full flag-change scan takes 7 presents (~117 ms), resolving the unmeasured latency; the documented save layout was verified on all six real slots (revision `2982123` matches the game's data revision). The game autosaves into slots, but not on every map transition. Two flags tick once per second and may be a play-time source; they are **unidentified**. Chest, rupee, damage and enemy events were not exercised. **The explicit next step is now:** run a normal play session with the same client while opening a chest, killing an enemy, taking damage and saving, then resolve the two counters and attribute the changed hashes. The full application can start Phase 1 once that is done.
