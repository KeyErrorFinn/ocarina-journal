# Implementation roadmap

Effort unit: **person-weeks (pw)** of one experienced Rust + TypeScript developer familiar with the codebase, working on Windows with a game dump and a capable GPU. Ranges include normal rework but not waiting for upstream review. Difficulty: Low / Medium / High. All estimates are **[I]** judgement, not measurements.

Decision gates are marked **GATE**: if the criterion fails, the plan changes as described.

## Critical path

```
P0 spikes S1+S2 -> P1 PoC -> P2 game-state -> P3 foundation -> P4 core features -> P6 reliability -> P7 distribution
                              \_ upstream RFC/PRs (parallel, not blocking) _/
P5 features (Ocarina, Quiz, Photo) can start after P3 and run in parallel with P4.
```

Independent from the critical path: Ocarina synthesis, Quiz authoring, Photo editor, theme/UI kit, installer scaffolding, fake-bridge test kit, and all upstream RFC work.

## Phase 0: Research and validation (2-3 pw, Medium)

**Objectives.** Replace the unverified items that decide scope: (A) the live Zelda Notes behaviour; (B) real bridge behaviour on Windows; (C) a flag-name census; (D) the `PlayReport` question; (E) legal sign-off.

**Prerequisites.** Longshot v3.0.0 built from the user's own dump on Windows; a copy of a real save; for A, a Nintendo Account that owns the game, an Android device and the official app.

**Work packages.**
- **S1: Bridge on Windows.** Add `HOS_CONTROL=zn-spike` to `longshot_env.txt`. Write a 100-line Rust client: connect to `\\.\pipe\zn-spike`, `status`, `subscribe events:["oot"] every:6 changes:true flags:["PlayerStatus.Life","PlayerStatus.CurrentRupee"]`. Log the game's `control: oot changes scan:` line (table sizes, slice, presents per full pass). Record: open a chest, collect rupees, kill an enemy, take damage, change map, save and quit.
- **S2: Flag-name census.** Local tool reading the user's romfs: build the hash-to-name dictionary (item rows, `IsTreasureBoxOpen.*`, `DefeatedEnemyNum.*`, `Step_*`, `DungeonInfo.*`), then search for counters of grass cut, jumps, distance, play time, game overs, deaths. Output stays local.
- **S3: PlayReport probe.** In a **scratch Longshot checkout** (not published), log the `PlayReport` object's fields in the `Save`/`Send` HLEs (`host/nn_applet.c` lines 385-389) while playing; list event ids and keys. Determines whether OoT has BOTW-style reports.
- **S4: Save-write behaviour.** Using the user's copies: observe write timing (watch + log mtimes) for chest, map transition, menu save, quit; check whether the file is replaced atomically.
- **A: Official app walk-through** (`ZELDA_NOTES_REVERSE_ENGINEERING.md` s.7).
- **E: Legal review** of RISKS items before any APK analysis or community service.
- **U: Upstream RFC**: open a Longshot issue citing #582, #42, #1655, proposing the Part III extensions; ask the maintainers' preference (contributions vs separate repo).

**Source files created.** `tools/flag-census/`, `tools/bridge-recorder/` (spike versions), notes under `docs/research/spikes/`.

**Dependencies.** None external except the dump and an account.

**Risks.** Windows pipe fails (**GATE 1**); change-scan latency > 1 s; names unrecoverable from romfs; user cannot run the app walk-through.

**Testing.** Spikes are manual with written logs; commit only sanitised summaries.

**Acceptance.** S1 log shows a continuous `oot` stream on Windows for 30 minutes with at least one chest-flag change correctly attributed; S2 produces a dictionary that resolves >= 95% of `changed` hashes seen in S1 or states which categories fail; S3 gives a yes/no on OoT play reports; A gives a verified feature list; E gives go/no-go.

**GATE 1.** If the Windows pipe cannot be made to work after upstream consultation, the live channel is replaced by save-watch only for MVP and the plan loses live position (the map becomes progress-only). This is the single biggest schedule risk.

## Phase 1: Minimal proof of concept (1.5-2 pw, Low)

**Objectives.** Detect Longshot, connect, read one verified value (rupees or hearts), display it in a minimal Tauri app, survive a game restart.

**Prerequisites.** Phase 0 S1 passed.

**Files to create.** Cargo workspace; `crates/zn-bridge`, `crates/zn-protocol`, `crates/zn-discovery` (minimal); `apps/companion/src-tauri`, `apps/companion/ui` (one screen: connection pill + hearts + rupees + map name).

**Tasks.** pipe client with framing, 1 MB line cap, reconnect backoff; `status` handshake; `oot` subscription; process detection; consented `longshot_env.txt` helper (with backup and diff); UI wiring through Tauri events; basic CI (cargo test + pnpm build).

**Dependencies.** `tokio`, `serde`, `serde_json`, `tauri` 2, `windows-sys` or `sysinfo`.

**Risks.** `longshot_env.txt` location differs by launcher version; WebView2 missing.

**Testing.** Unit tests of framing/partial-line/overlong-line/out-of-order replies against `zn-testkit` fake bridge; manual run with real game.

**Acceptance.** With the game at the title -> loaded save, the UI shows hearts and rupees updating within 300 ms of change (measured); killing and restarting Longshot returns to "Connected" automatically in < 10 s; CPU < 1% idle; no change in the game's frame time within measurement noise.

## Phase 2: Game-state integration (4-5 pw, Medium-High)

**Objectives.** Player location, inventory, save slots, progression flags, event notifications.

**Prerequisites.** Phase 1; S2 dictionary approach proven.

**Files.** `crates/zn-savefile`, `crates/zn-gamedata`, `crates/zn-core` (event processor v1), `crates/zn-store` v1 schema.

**Tasks.**
1. Save parser (read-only, validated, hashes, key table).
2. Catalogue builder from the user's romfs (SARC, BYML, zstd with dictionary), cached by revision.
3. Hash dictionary; flag lookup service; hot-flag watch list (<=64) with rotation.
4. Event processor: chest, song, enemy defeat, map change, damage, rupee gain, quest step.
5. `saves` polling and file watcher; reconciliation (save vs live).
6. Slot model; "active slot" heuristic.
7. SQLite persistence; trail down-sampler.
8. Upstream: submit `flags64`, `build/slot` in status, read-only scope PRs (parallel).

**Dependencies.** `zstd`, `notify`, `rusqlite`; Phase 0 findings; maintainers' answers.

**Risks.** Names/units wrong; 64-bit keys missing until upstream; romfs layout differences; PR 1401 never merged so format knowledge is from an unreviewed branch.

**Testing.** Property tests (round trip, mutation fuzz), synthetic game generator, golden event tests, contract tests with recorded sessions. Cross-validate parser output against Longshot's own bridge values on a real save (hearts, rupees, map).

**Acceptance.** For a real save: parsed hearts/rupees/age/map equal the live bridge values; at least 20 different flag categories tracked; a chest opened in game produces a `CollectibleEvent` in < 1 s (live) and is confirmed by the next save; restart gives no phantom events.

**GATE 2.** If < 90% of tracked hashes can be named from romfs, narrow scope to categories that work and mark the rest "unnamed" until upstream/community tables exist (names derived only from the user's files; shipping tables is not allowed).

## Phase 3: Companion application foundation (4-5 pw, Medium)

**Objectives.** Navigation, DB, synchronisation, settings, connection management, window modes.

**Files.** `apps/companion/ui/src/app`, `features/connection`, `features/settings`; `zn-store` migrations; `zn-discovery` full; installer scaffolding.

**Tasks.** App shell with the three density layouts; theme system (dark/light, accent, reduced motion); setup wizard; diagnostics drawer; settings persistence; slot selector; data export/import; tray and start-with-Windows; error surfaces; localisation framework (English first); accessibility baseline; command palette; keyboard/controller focus system; second-monitor and mini modes.

**Dependencies.** Phase 2 snapshot API.

**Risks.** UI churn; controller capture conflicts with the game.

**Testing.** Storybook visual states, Playwright E2E with fake backend, axe accessibility checks, manual keyboard-only pass.

**Acceptance.** All lifecycle states in `COMPANION_APP_ARCHITECTURE.md` s.7 reachable and verified manually (with a script); setup wizard completes in < 2 minutes for a new user (usability test, 5 users); WCAG AA contrast verified; idle CPU/RAM within budget.

## Phase 4: Core Zelda Notes features (6-8 pw, Medium-High)

**Objectives.** Maps, collectibles, quest tracking, gameplay statistics: features 1, 2, 4, 5 (partial), 6 (partial), 9.

**Files.** `features/map`, `features/collectibles`, `features/foes`, `features/record`, `features/quests`; `crates/zn-core` aggregators; `data/maps` (authored).

**Tasks.** Map canvas and area geometry (origin/scale/north calibration from placement bounds; resolves PR 1655's open "is up north?" question); marker engine; completion model; Hall of Fallen Foes grid; quest progress view; Today's Record aggregator with day logic and gap handling; My Play Data totals; honest "n/a" for unsourced metrics; author schematic map backgrounds for the areas covered first (Kokiri Forest, Hyrule Field, Castle Town, Kakariko, Death Mountain, Zora's Domain, Gerudo Valley ... incremental).

**Dependencies.** Phase 2 catalogue; art/authoring time; upstream `flags64` for live Skulltulas (fallback: save).

**Risks.** Map calibration across 80 maps (`GameBancParam` has 80, **[C]** `host/oot_area_names.c`) is laborious; child/adult area sharing; Today's Record accuracy.

**Testing.** Golden marker counts per area (synthetic), manual walk-throughs, regression on day boundaries/time zones/DST, replay recorded sessions.

**Acceptance.** In Kokiri Forest and one dungeon, every marker shown corresponds to a real placement; collecting an item flips its marker within the scan latency; the Record totals for a scripted 10-minute session equal ground truth from game-side counters within 2% (enemies, rupees, hearts); completion % stable across restarts.

## Phase 5: Advanced features and local alternatives (8-12 pw, Medium; parallelisable)

**Objectives.** Features 3, 7-8, 10-12 and extras.

| Package | Work | Effort |
|---|---|---|
| Play Ocarina | synth, note UI, guide/auto modes, score editor/share format, gamepad | 2 pw |
| Quiz | engine, daily limit, streak/levels, authoring tool, 200-300 original questions | 2-3 pw (content-heavy) |
| Photo | capture via `shot`, editor, original frames/stamps, export | 2 pw |
| Location Quests | catalogue-driven prompts, proximity verifier, ledger | 1.5-2 pw |
| amiibo viewer (optional) | read-only NFC folder viewer | 0.5 pw |
| In-game ocarina drive (optional, consented) | `press` sequencing, confirmations, auto-off | 1 pw + spikes |
| Community statistics (optional, separate service) | backend, privacy policy, abuse, client | 6+ pw, **recommend deferring** |

**Risks.** Content volume; legal view on song encodings; cheating in community data; scope creep.

**Testing.** Feature-level unit tests, audio latency measurements (< 40 ms input-to-sound), quiz content review, usability tests.

**Acceptance.** Per package: feature complete against its section in `FEATURE_PARITY_MATRIX.md`; each approximation carries the "local approximation" label in-app.

## Phase 6: Reliability and compatibility (4-5 pw, Medium)

**Objectives.** Automated testing, performance optimisation, save integrity, Longshot-update compatibility.

**Tasks.** Windows CI with real named-pipe contract tests against the fake bridge **and** a nightly job that starts a real Longshot if a runner with the dump exists (upstream has no Windows runner **[C]**, so likely a self-hosted/manual job); soak test (8 h); fuzzing; performance A/B (PresentMon) with and without the companion; save-parse hardening against truncated/partial files; compatibility matrix automation (Longshot version x protocol x game revision); crash handling; telemetry **off**; log redaction; upgrade/migration tests for the DB.

**Acceptance.** 8 h soak with no leak (RSS growth < 5%) and no dropped samples under normal load; 0 writes to any save path (verified by a file-system audit test); frame-time delta within noise; compatibility matrix filled for stable `v3.0.0`, latest nightly, and one prior RC.

## Phase 7: Distribution (2-3 pw, Low-Medium)

**Tasks.** MSI/NSIS installer with WebView2 bootstrap; portable zip; code signing (certificate needed); update strategy (Tauri updater with signed manifests, user-controlled); install docs; troubleshooting guide; compatibility matrix on the site; a privacy statement; third-party licence notices (`cargo about`, `pnpm licenses`); SBOM.

**Acceptance.** Clean install on fresh Windows 10 and 11 VMs; SmartScreen reputation plan; uninstall leaves user data unless asked; reproducible build from tag.

## Summary of effort

| Phase | Effort (pw) | Difficulty |
|---|---|---|
| 0 | 2-3 | Medium |
| 1 | 1.5-2 | Low |
| 2 | 4-5 | Medium-High |
| 3 | 4-5 | Medium |
| 4 | 6-8 | Medium-High |
| 5 | 8-12 (excluding community service) | Medium |
| 6 | 4-5 | Medium |
| 7 | 2-3 | Low-Medium |
| **Total** | **31.5-43 pw** (about 8-10 months for one person; about 4-5 months for a team of three with the parallel packages) | |

Excludes: legal counsel, art/music production beyond a basic set, hosting, and any upstream review delay.

## Parallel work packages

- Fake bridge and test kit: independent from day one.
- UI kit, theme, setup wizard: independent of game data.
- Ocarina/Quiz/Photo: independent after the Phase 3 shell.
- Upstream RFC and PRs: independent, nonblocking.
- Authoring: quiz content, map art, stamps/frames: independent, parallel with engineering.

## Milestone demos

M1 (end P1): live hearts/rupees. M2 (end P2): live chest and enemy events plus save reconciliation. M3 (end P3): usable shell. M4 (end P4): map + collectibles + Record usable in play. M5 (end P5): Ocarina, Quiz, Photo. M6 (end P7): signed installer, public release.
