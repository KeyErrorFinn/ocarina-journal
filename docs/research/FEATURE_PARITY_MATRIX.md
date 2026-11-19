# Feature parity matrix

How to read it. **Official** behaviour is from `ZELDA_NOTES_REVERSE_ENGINEERING.md` (mostly secondary sources; nobody has inspected the live app here). **Longshot** columns come from `GAME_STATE_AND_SAVE_FORMATS.md` and `INTEGRATION_OPTIONS.md`. Nothing in this document claims a local feature is identical to Nintendo's.

Tags: **[C]** confirmed in source, **[S]** secondary, **[I]** inference, **[U]** unverified.

## Revision 2 corrections (supersede any conflicting text below)

Nintendo's own UK page now defines the OoT feature list (`ZELDA_NOTES_REVERSE_ENGINEERING.md` s.6, tag **[N]**). Where a section below says "[S]" or "no source", this table wins.

| # | Feature | Nintendo's description **[N]** | Effect on classification |
|---|---|---|---|
| 1 | Map | Finds missed **Pieces of Heart and treasure chests, including dungeons**; can **hide unvisited places** (spoiler control) | Unchanged D/M/R. Add: an "unvisited places" mask derived from our own visited-area history (we can approximate "visited"; Nintendo's rule is unknown **[U]**). Gold Skulltulas are *not* named by Nintendo; we may still track them as an extra. |
| 2 | Gossip Quests | **In-game snapshot** hint; points for **sheet music in Play Ocarina**; **rupees spent to reveal a general location, transferred to the app at in-game shops** | Still **L**. The rupee-for-hint path needs the game to take rupees and hand data to a service: we **cannot** spend in-game rupees (no save writes); local hints cost local points instead. |
| 3 | Hall of Fallen Foes | **Bosses defeated, personal records, medals, leaderboard** (after reaching the Hall) | Bosses/records **D** (flags); **medals** definitions unknown **[U]** (ours are local); **leaderboard N**. |
| 4 | Today's Record | Chronological accomplishments **with automatic screenshots**; daily stats (enemies, rupees) | **L**; automatic screenshots: we can call bridge `shot` on events (map entry, boss defeat, chest) at a rate limit. Official trigger rules **[U]**. |
| 5 | My Play Data | **Medals** for milestones (e.g. treasures found) | **L**: local medal catalogue computed from collectible counts. Nintendo's medal list is not public here. |
| 6 | Global Play Data | Compare records with players worldwide | **N** (unchanged). |
| 7 | Photo Studio | Frames and stamps on in-game screenshots; attach **Play Ocarina QR codes** | **L**; QR payload is Nintendo's format **[U]**: use our own score format. |
| 8 | **Threads of Time+** | **Tapestry of Link's journey; touching sections replays cutscenes from that point in the story** | **Not** the same as the in-game quest log. A progress tapestry is **D** (`Step_*` flags + our history). **Cutscene replay is R** (needs a way to start story events in the running game; the bridge has only `teleport` and `age`, and writes game state) and is **out of the read-only scope**: deferred, explicit consent required, and unproven. |
| 9 | amiibo | Zelda amiibo give **in-game items once per day**; **five scans give one extra scan that day** | In-game amiibo works via Longshot's `nn_nfp.c` **[C]**. The daily limit and 5-scan bonus are enforced by Nintendo's side **[I]**; we do not replicate them (no item grants). |
| 10 | Play Ocarina | **Free Play, Guided Play, Demo Play**; sheet music for in-game songs or via Gossip Quests; create melodies; **QR share** | **D** standalone (modes now fixed to these three names in our design, with our own audio and our own QR format). |
| 11 | Quiz | **2,000+** multiple-choice, **two difficulty levels**, once per day each, **20 rupees for another attempt** | **L**. We charge local points, never save rupees. |

The earlier statement "**Threads of Time+ is not found in any source**" (section 9) was wrong.

## Classification key

| Class | Meaning |
|---|---|
| **D** | Directly implementable on Longshot v3.0.0 as is. |
| **M** | Implementable with Longshot modifications (small upstream patch). |
| **R** | Implementable with substantial reverse engineering of the game. |
| **L** | Implementable only as a local approximation of the official feature. |
| **N** | Dependent on unavailable Nintendo services. A local alternative may exist but is not the same feature. |
| **X** | Currently infeasible. |

A feature can carry two classes (core part / extra part).

## Summary

| # | Feature | Class | Core data source | Biggest obstacle |
|---|---|---|---|---|
| 1 | Interactive map | **D** (position, trail, chests) + **M** (live Gold Skulltulas/heart pieces) + **R** (rendered map art) | bridge `pos`/`map` + placements from user's romfs | no distributable map art; north/scale unverified |
| 2 | Collectible / discovery tracking | **D** (save-based, chests live) + **M** (live 64-bit keys) | `progress.sav` + flags | needs user romfs for names; official scope unclear |
| 3 | Gossip Quests | **L** | location catalogue + `pos` + local screenshots | official photos/points/server content unavailable |
| 4 | Hall of Fallen Foes | **D** | `DefeatedEnemyNum.*` flags | names/icons need user's romfs; official rematch content in-game |
| 5 | Today's Record | **L** + **R/M** for some metrics | companion event history | grass cut, jumps, game overs, play time have no source today |
| 6 | My Play Data | **L** | companion history | saves hold no play time or counters |
| 7 | Global Play Data | **N** | none | no Nintendo data; opt-in community service possible but a different thing |
| 8 | Photo Studio | **L** | bridge `shot` | official in-game photo flow unknown; original frames/stamps needed |
| 9 | Threads of Time+ | **D** (progress tapestry); **R** (cutscene replay, write-capable, deferred) | `Step_*` flags + history | cutscene replay has no mechanism in Longshot; quest names/text from user romfs |
| 10 | amiibo | In-game: **D** (Longshot `nn_nfp.c`). App-side daily bonus: **N** | tag files | server-enforced daily limit unavailable |
| 11 | Play Ocarina | **D** (standalone) / **M** (drive the in-game ocarina) | local audio | none for standalone; note the official 300-point score unlocks are **N**/**L** |
| 12 | Ocarina of Time Quiz | **L** (original questions) | authored content | content volume; no copying Nintendo's 2,000+ |
| 13 | Other (Daily Bonus, Item Sharing, Voice Memories, Navigation) | **N** / not confirmed for OoT | | unconfirmed for OoT |

## 1. Interactive map

**Official.** "Interactive map" **[S]** (Wikipedia). For OoT, no description from Nintendo. In BOTW/TOTK the related feature is "Navigation: a voice guides you in real time to Koroks and hard-to-reach shrines" and achievement rates **[N]**. Whether the OoT map shows Link live, collectibles, or unvisited areas is **[U]**.

**Data.** Link position/map/age (`status.game`, `oot` events) **[C]**; per-area chests, Gold Skulltulas, heart pieces, heart containers with positions (placement files in user's romfs) **[C]** via PR 1401/1655 method; collected state from flags or save. 64-bit-key collectibles are save-only today **[C]**.

**Longshot integration.** Live: exposed now. Missing: `Bool64bitKey` on the bridge (small patch, internal function exists).

**PC implementation.**
- UI: map canvas (SVG/Canvas 2D), layers (Link, trail, chests, skulltulas, heart pieces, dungeon markers), area switcher with child/adult handling (areas share markers across ages per PR 1655), search/filter, completion chips.
- Backend: `map` module; `catalogue` module building area -> markers from the user's romfs and caching in app data.
- Model: `Area{id,name,bounds}`, `Marker{id,kind,x,y,z,flagRef}`, `Trail{area,points}`.
- Sync: on `map` event load the area; marker state = save snapshot overlaid by live flag changes; refresh save on file change.
- Persistence: trails and visited-area history in SQLite; catalogue in a cache file keyed by game revision.
- Tests: fake bridge fixtures (PR 1655 already shows the approach), synthetic placement files, golden marker counts for the synthetic game.

**Map art (the hard part).** Nintendo's map art cannot be shipped. Options: (a) original schematic backgrounds drawn by us per area, (b) a **user-local** top-down render generated from the player's own romfs (an extraction/render pipeline: **R**, large), (c) trail-only "fog of exploration" like PR 1655's prototype ("no map pictures ... none are shipped"). MVP = (c); polish = (a). (b) is optional and deferred.

**Feasibility: D for core; M for live Skulltulas/pieces; R for rendered map.** Evidence: PR 1655 displayed Link and 10 Kokiri Forest markers (7 chests, 3 skulltulas) on Linux, "Windows not tested".

## 2. Collectible and discovery tracking

**Official.** **[U]**: one guide states Zelda Notes does *not* list Heart Pieces or Gold Skulltulas; Wikipedia says "track player progress". The Lichii thread assumes OoT notes should cover them.

**Data.** Heart containers/pieces, Gold Skulltulas (of 100), chests, small keys/maps/compasses/boss keys, songs, quest items, bosses defeated: all in the save (`GAME_STATE_AND_SAVE_FORMATS.md` s.3). Completion percentage is **our** computation, not the game's (PR 1401: "The game itself has no percentage").

**Implementation.** `completion` module computing per-category have/total from catalogue + snapshot; list views by area with "missing" filter; per-item "where" text from placements; live updates via `changes`. Persist per-slot history of first-collected timestamps (the save has none) in SQLite.

**Feasibility: D** (save-based; chests live), **M** (live 64-bit). Needs the user's own romfs for names.

## 3. Gossip Quests

**Official.** Photo of a Hyrule location, find it in game, earn points (reported 30 or 40; 100 quests), hint button, points unlock Play Ocarina scores **[S]**.

**What is needed.** A set of location prompts (images), a way to verify "you are there", a points ledger, hint logic. Official photo set and points unlock are Nintendo content and server-authoritative **[U]**.

**Local alternative (approximation, say so in the UI).** "Location Quests": for each catalogue place (from placement data), show a **screenshot taken by the user's own game** (bridge `shot`, or in-game capture) and a text hint; mark complete when `pos` stays within a radius of the target in the right `map` for N seconds. Points are a local ledger. Original hint text. Provide an "assist" button that reveals the area name. No official photos copied.

**Longshot.** `shot` command exists **[C]** (PNG of game picture); PR 1709 adds a Screenshot hotkey (open). Capturing requires the player to walk there first, so the local feature is "discover and collect your own photo quests", plus authored quests with hand-written hints that need no image.

**Feasibility: L.** Not identical, and cannot honestly be called Gossip Quests.

## 4. Hall of Fallen Foes

**Official.** "A dream hall with statues of defeated monsters and boss rematches" **[S]** single-source; probably an in-game location whose counters the app can display. **[U]**

**Data.** `DefeatedEnemyNum.<actor>` Int flags per enemy and boss; PR 1401 enumerates exactly which enemies "the Hall has a statue and a counter for" from the game's own data. **[C]** Live via bridge `flags`/`changes` (Int kind scanned) **[C]**.

**Implementation.** Grid of enemy tiles: count, first-defeated time (ours), new-kill toast. Names/icons from the user's romfs text; if icons are unavailable, original generic glyphs by enemy family.

**Feasibility: D.** Risk: change-scan latency and name recovery from romfs.

## 5. Today's Record

**Official.** Daily log of what you did in order with running totals: time played, enemies defeated, Rupees earned, hearts lost, game overs, distance travelled, grass cut, jumps **[S]** OOTGuide. Whether it shows per-event timeline, and the day boundary (local midnight? reset time?) **[U]**.

**Data per metric.**

| Metric | Source today | Class |
|---|---|---|
| Time played | companion: sum of intervals with fresh `oot` samples and `loading/event` false, or wall clock between session start and end. Not equal to the game's number. | L |
| Enemies defeated | sum of positive `DefeatedEnemyNum.*` deltas | D |
| Rupees earned | positive `rupees` deltas (cannot distinguish earn from refund/transfer, spends excluded) | L |
| Hearts lost | negative `life` deltas (healing excluded; damage while at 0 ignored) | D/L |
| Game overs | no event; observed pattern: `life` hits 0 with `event` true, then Link may be **revived in place** (no load) — so a death is observable but a *game over* needs the load/title to follow; true game over not yet observed | L; **M** with a game-over event |
| Distance travelled | integrate `pos` between samples with jump filtering (teleports, cutscenes) | L |
| Grass cut, jumps | **no source found**; a flag may exist **[U]**; otherwise needs a hook | R/M |

**Implementation.** Event processor turns samples into typed events (`rupee_gain`, `damage`, `enemy_defeated`, `map_change`), a daily aggregator keyed by the user's local date, and a timeline UI. Everything is persisted in SQLite so history survives restarts. Be explicit in UI: "measured by this app while connected; may differ from Nintendo's".

**Feasibility: L** with R/M extras. Evidence that the game does count some of these: Nintendo's Today's Record reportedly lists them, so counters exist somewhere (game or server) **[S]**. The prepo spike (option C1) may reveal them.

## 6. My Play Data

**Official.** Personal records such as game overs and enemies defeated (BOTW wording **[N]**).

**Local.** Totals from the companion's history plus authoritative save-derived counters (enemy defeats, collectibles). Time played and game overs only since the app began recording; backfill impossible **[C]** (no play time in saves). A "recorded since" banner.

**Feasibility: L.**

## 7. Global Play Data

**Official.** Compare with players worldwide **[N]** (BOTW). Needs Nintendo's aggregation: **N**.

**Alternative.** Optional **community statistics service**, strictly opt-in: anonymised daily aggregates (counts only, no account, no save, no position) uploaded to a backend we operate, with a public percentile API. Requires hosting, abuse resistance, privacy policy, and a critical mass of users; leaderboards invite cheating (the bridge itself can teleport and `rw` memory). It is a different product; label it "Community Data". Not in MVP.

**Feasibility: N** for official; community variant is a large separate service effort.

## 8. Photo Studio

**Official.** Send in-game photos to the app; frames, stamps, QR codes **[N]** (BOTW/TOTK); OoT presence **[S]** ZeldaCentral, in-game capture flow **[U]**.

**Local.** Capture via bridge `shot` (1280x720 PNG, no HUD overlay except the game's own HUD **[C]**: "A shot is the game's own picture: the Insert menu and the FPS counter ... are not in it"), or a user-chosen folder of screenshots (PR 1709's Screenshot control saves a PNG, open). Editor: crop, original frames/stamps (our art), text, export PNG, QR of a share string. Note `shot` accepts a path anywhere the user can write: use the bridge's default folder or the app's temp folder.

**Feasibility: L.** Straightforward UI work, no game dependency beyond `shot`.

## 9. Threads of Time (+)

**Official.** Nintendo: "Threads of Time+" displays a tapestry of Link's journey and replays cutscenes from touched sections **[N]**. Separately, the base game has an in-game quest log called Threads of Time (pause-menu tab) **[S]**; the "+" is the Zelda Notes extension. (Revision 1 wrongly said the "+" was undefined.)

**Local.** A **Quest Progress** view: `Step_<quest>` flags mapped to quest names and step text from the user's romfs, grouped Story / Side, with done/in-progress/not-started. This is a progress mirror, not the game's UI, and does not contain the game's story text unless read at runtime from the user's own files.

**Feasibility: D** for a progress tapestry (our design, from quest flags and recorded history); **R** for cutscene replay (needs write access to game events; deferred).

## 10. amiibo

**Official.** After Child Link first enters Hyrule Field, each figure gives random supplies once a day **[S]** ZeldaCentral. In BOTW the app lets each Zelda amiibo be used **one extra time per day** **[N]** (server/phone mediated).

**Longshot.** The game's `nn::nfp` is implemented from files in `%LOCALAPPDATA%\Longshot\nfc` or a Switch 2 Pro Controller reader (`docs/nfc.md`) **[C]**; the Insert menu's NFC tab is the front. The in-game amiibo feature should therefore already work locally. Whether the "extra daily use via the app" is meaningful here is **N** (server-enforced).

**Companion value.** A read-only NFC folder viewer (list tag files, model name from public header bytes, "last used" from our own record) is optional. Tag dumps must never be uploaded or committed (`docs/nfc.md`: "No tag dump is ever committed, uploaded or put in an issue").

**Feasibility: D** (in-game, existing), **N** (app-side bonus).

## 11. Play Ocarina

**Official.** Phone touchscreen as ocarina; free play, guide mode with note durations, auto-play, write scores, share by QR; scores bought with points **[S]**.

**Local.** Fully standalone: synthesised ocarina (Web Audio or Rust synth), touch/mouse/keyboard/gamepad input, original-sound ocarina samples (we record or synthesise; do not copy game audio), optional song library of the twelve in-game songs as short note sequences (the melodies are Nintendo compositions: whether encoding them is acceptable is a **legal uncertainty**, see `RISKS_AND_LIMITATIONS.md`; the default build can ship none and let players enter their own), custom scores saved locally, share as our own QR/URL format. Unlocks: either all open, or a local points ledger tied to Location Quests.

**Optional M.** "Play into the game": send `press` button sequences to the in-game ocarina. Longshot reads ocarina notes from button rows (`oc_notes`) and voice **[C]**; the bridge `press`/`sequence` can drive buttons with frame timing. This crosses the read-only line, so it is a separate toggle with confirmation. Whether the exact ocarina note buttons can be driven by name is **[U]**.

**Feasibility: D** (standalone). **M** (in-game drive).

## 12. Ocarina of Time Quiz

**Official.** 2,000+ questions with a picture and four answers, 10 s timer, one free attempt per day, extra attempts cost Rupees, best streak raises Egg Level/Cucco Level **[S]**.

**Local.** Original question bank written for this project, no copying; images only from our own art or from screenshots the user took. Daily free attempt, streak, levels. Extra attempts cost **points** from the local ledger, **never in-game Rupees**: charging Rupees would require writing the save. Content authoring effort is the cost: a viable v1 is 200-300 questions with a mechanism to import community packs.

**Feasibility: L.**

## 13. Other features

Voice Memories, Navigation, Item Sharing (QR) and Daily Bonus are **[N]** features of the BOTW/TOTK service. None is confirmed for OoT. Item sharing and Daily Bonus would require writing items into the save or awarding items in game, which this project does not do. Parked.

## What would raise parity

1. A legitimate walk-through of the live app (Phase 0 package A) to replace secondary sources.
2. Upstream bridge patches: `Bool64bitKey`, game-over/save events, read-only scope.
3. The `PlayReport` spike. If OoT's play reports exist and are readable, Today's Record and My Play Data move from L toward D.
4. A flag-name census from the user's romfs to find grass-cut/jump/distance counters, if the game keeps any.
