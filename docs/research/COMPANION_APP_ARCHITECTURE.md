# Companion application architecture

Status: design. Nothing here is built. Every dependency named is a normal public crate or package; versions are to be pinned at Phase 1. Tags: **[C]** confirmed in Longshot source, **[I]** inference/design judgement, **[U]** unverified.

## 1. Stack evaluation

Preferred: Tauri 2, React, TypeScript, Vite, Rust backend, SQLite, pnpm. **Verdict: appropriate. Keep it.**

| Need | Tauri 2 + Rust fit |
|---|---|
| Windows named pipe client | Rust has first-class async named pipes in `tokio` (`tokio::net::windows::named_pipe`) **[I]**; no native module bridge needed. |
| Low idle CPU/RAM next to a game that is itself CPU-bound | Tauri uses the OS WebView (WebView2 on Windows 11) rather than bundling Chromium; the Rust side is small. Longshot's own design notes say the CPU "saturates first" and extra threads lowered fps before (`docs/design.md` s.4 rule 7), so the companion must be light. **[C]** for the game's constraint, **[I]** for the choice. |
| Save parsing (binary, zstd) | Rust: straightforward with `zstd`; port MurmurHash3 (trivial, standard algorithm). |
| Local persistence | SQLite via `rusqlite` with the bundled feature, WAL mode. |
| Packaging | Tauri bundler: MSI/NSIS installer plus a portable zip. |
| Always-on-top / second monitor | Tauri window config and multi-window; native. |
| Controller navigation | Web Gamepad API in the WebView, or Rust `gilrs` for global input; evaluate in Phase 3. |

Alternatives considered and rejected:

- **Electron**: larger memory and disk footprint, no benefit here. nxapi uses it **[S]**, irrelevant to our constraints.
- **.NET/WPF/WinUI**: fine technically; loses cross-platform (Longshot supports Linux; the Linux bridge is a Unix socket) and the web-UI map ecosystem.
- **Qt/QML** (the Lichii "Adventure Notes" approach **[S]**): the Lichii thread itself lists "adds a Qt6Qml dependency" as a limit; heavier tooling.
- **Python script + browser page** (PR 1655's approach **[C]**): excellent as a prototype; not a "purpose-built game companion", needs Python on PATH.

One risk to carry: WebView2 Evergreen runtime is present on Windows 11 but not guaranteed on stripped Windows 10; the installer must bootstrap it. **[I]**

Linux/Steam Deck: Longshot supports it and the bridge is a Unix socket **[C]**. Keep the transport behind a trait so a Linux build is possible later. Windows is the committed target.

## 2. Process model

```
 ┌──────────────────────────── Companion (one Tauri process) ───────────────────────────┐
 │  WebView2 (React/TS UI)  <── Tauri IPC (commands, events) ──>  Rust core              │
 │                                                                                       │
 │  Rust core tasks (tokio):                                                             │
 │   discovery   find Longshot install, game folder, saves, process state                │
 │   bridge      pipe client: handshake, subscribe, reader, reconnect, backpressure      │
 │   savewatch   file watcher + validated read-only parser                               │
 │   catalogue   build/cached hash->name + placements from user's romfs                  │
 │   events      sample -> typed events, aggregators (daily stats, completion)           │
 │   store       SQLite writer (single writer task, WAL), query API                      │
 │   mapdata     area geometry, markers                                                  │
 │   aux         photo, quiz, ocarina, optional local view server (127.0.0.1)            │
 └───────────────────────────────────────────────────────────────────────────────────────┘
          │ named pipe \\.\pipe\<name>                │ read-only file reads
          ▼                                           ▼
   Longshot control bridge (in game process)    save folder (progress.sav, caption.sav)
```

One process keeps RAM and idle CPU minimal. The game process is never touched except through the pipe and read-only file reads.

## 3. Proposed repository structure

```
/                               (this repo)
  Cargo.toml                    workspace
  pnpm-workspace.yaml
  package.json
  rust-toolchain.toml
  apps/
    companion/
      src-tauri/                Tauri 2 app crate (thin: wiring, commands, windows, tray)
        Cargo.toml  tauri.conf.json  capabilities/  icons/
      ui/                       React + TypeScript + Vite
        src/
          app/                  shell, routing, theme, window modes
          features/
            connection/         status, setup wizard, diagnostics
            map/                canvas, layers, search
            collectibles/       lists, completion
            foes/               Hall of Fallen Foes view
            record/             Today's Record, My Play Data
            quests/             quest progress (Threads of Time view)
            gossip/             Location Quests (local)
            photo/              capture, editor, export
            ocarina/            virtual ocarina, scores
            quiz/               local quiz
            settings/
          lib/                  tauri bindings (generated), formatting, hooks
          assets/               ORIGINAL art only
  crates/
    zn-protocol/                Part II schemas (serde), JSON schema export, version consts
    zn-bridge/                  Longshot bridge client (transport trait, pipe/Unix impl, reconnect, rate limit)
    zn-savefile/                read-only save parser, validator, MurmurHash3, flag-table access
    zn-gamedata/                catalogue builder: SARC/BYML/zstd readers for the user's romfs; hash->name; placements
    zn-core/                    event processor, aggregators, completion, trail builder, state machine
    zn-store/                   SQLite schema, migrations, repositories
    zn-discovery/               locate Longshot/Launcher/game/save dirs, process checks
    zn-testkit/                 fake bridge server, synthetic save/game generator, fixtures builder
  data/
    maps/                       ORIGINAL schematic map data we author (SVG/JSON), no game art
    quiz/                       ORIGINAL question packs
    ocarina/                    ORIGINAL synthesised samples
    stamps-frames/              ORIGINAL art
  docs/
    research/                   these documents
    protocol/                   generated schema docs
  tools/
    flag-census/                CLI: dump the hash->name universe from a user's romfs (local, never shipped)
    bridge-recorder/            record/replay a real bridge session to a fixture (sanitised)
  tests/
    contract/                   bridge contract tests
    fixtures/                   synthetic saves, recorded bridge sessions (no game data)
    e2e/                        Playwright against the UI with a fake backend
  .github/ or .forgejo/         CI
```

Responsibilities:

| Component | Responsibility | Must not |
|---|---|---|
| `zn-bridge` | speak protocol 1; own the pipe; reconnect; bounded buffers; typed errors | interpret game semantics |
| `zn-savefile` | parse bytes into a flag table + key set; validate; never write | do I/O beyond a provided byte slice |
| `zn-gamedata` | read user's romfs files; build names and placements; cache keyed by revision | ship or embed any game file or derived table |
| `zn-core` | turn samples and snapshots into events and statistics; completion math | touch UI or disk |
| `zn-store` | schema, migrations, queries, retention | hold game logic |
| `zn-discovery` | find installs and processes; consented `longshot_env.txt` edit | modify anything without consent and backup |
| `apps/companion/src-tauri` | compose crates; expose commands/events; windows | contain business logic |
| UI features | presentation and interaction | parse game data |

## 4. Data flow: how a game event reaches the desktop app

```
Link opens a chest
  guest: GameDataMgr Bool flag IsTreasureBoxOpen.<hash> := 1
  host/oot_state_tap.c  (on Link's next update, if a subscriber is due)
        state_scan reads <=4096 slots/present -> notes changed hash
        publishes copied JSON line under state_lock          [game thread, no socket I/O]
  bridge thread -> pipe line {"event":"oot",... "changed":{"0x..":1}}
  zn-bridge reader task (never blocked by UI)
        -> bounded channel
  zn-core event processor
        hash -> name via catalogue -> CollectibleEvent{chest, area, pos}
        updates completion, trail, daily stats
  zn-store writer task: INSERT event; COMMIT (batched)
  Tauri emit game://collectible and data://changed
  React: map marker animates to "collected"; toast; list updates
  (<=~300 ms typical on top of the scan latency; scan latency itself is [U])
  Later: Save file written by the game -> file watcher -> validated parse -> reconcile
        (marks the event "confirmed by save"; adds any 64-bit keys that live events missed)
```

## 5. Persistence (SQLite)

Single DB in `%APPDATA%\<AppName>\companion.db`, WAL, a single writer task, migrations via an embedded runner. Tables (sketch):

| Table | Key columns |
|---|---|
| `profile` | id, longshot_profile_id, first_seen_ms, label |
| `slot` | id, profile_id, slot_name, revision, last_seen_ms, thumbnail_path? |
| `session` | id, slot_id, started_ms, ended_ms, longshot_version, end_reason |
| `sample_trail` | session_id, map, t_ms, x, y, z (down-sampled) |
| `event` | id, slot_id, session_id, kind, t_ms, payload_json, source, confidence |
| `snapshot` | slot_id, taken_ms, source, blob (parsed flags subset, compressed) |
| `daily_stat` | slot_id, day, metric, value, measured_by |
| `collectible_state` | slot_id, entry_id, first_seen_ms, state |
| `quiz_run`, `ocarina_score`, `photo`, `points_ledger` | local feature data |
| `setting` | key, value |
| `diagnostic` | t_ms, level, code, message |

Retention: trails thinned after 30 days; raw per-sample data never stored beyond trails. Export/import as one ZIP for backup. The DB never contains save bytes, only parsed counts and flag names.

## 6. Synchronisation logic (authoritative-source rules)

1. **Save snapshot is truth for state it contains**; live samples are truth for time and position and give faster hints.
2. A live hint is **provisional** until a save snapshot confirms or contradicts it. Contradictions resolve to the save.
3. Time-of-obtain for items first seen only in a save diff is recorded as "noticed at", `confidence=approx`.
4. After reconnect or restart, reconcile by diffing the latest snapshot against the previous; produce `gap=true` events; never fabricate intermediate events.
5. Slot identity: treat the bridge's `newest` slot as active unless/until upstream exposes the loaded slot; show a "which slot is active?" chip when two slots changed within 60 s.

## 7. Lifecycle behaviour when Longshot is...

| Situation | Detection | Companion behaviour |
|---|---|---|
| **Not installed** | discovery finds no launcher data or game folder | "Longshot not found" setup card: browse for game folder, link to Longshot's site, offline features (Ocarina, Quiz, Photo editor, imported-save view) stay usable. |
| **Installed, not running** | process list lacks `longshot.exe`; pipe absent | Idle state; shows last known data from DB; "Launch game" (opt-in) and "Watch saves" fallback active. |
| **Starting** (shader/pipeline preparation can take long: "A first start prepares the shaders before the first frame: the game reads no controller until then", `docs/control.md`; one issue reports hours on an Intel Arc A730) | process exists, pipe absent or `status.state=boot` | "Starting..." with elapsed time; poll pipe every 2 s; no error until 20 min, then a hint. |
| **Bridge off** | process exists, pipe absent after N s | Explain; offer to add `HOS_CONTROL=<name>` to `longshot_env.txt` (consent, backup, diff preview, "restart game required"); save-watch fallback meanwhile. |
| **Running normally** | `status.state=play`, fresh samples | Live mode. |
| **Loading a save** | `loading:true`, `state=loading`, samples stop | Freeze live indicators, show "Loading"; schedule save re-read at completion. |
| **Changing saves** | `newest`/mtime change + map reset | Close current slot session, open new one; reset trail context. |
| **Closing** | pipe EOF with process exit, or process gone | `end_reason=game_exit`; final save re-read after 2 s (game may flush on close); show summary. |
| **Crashing** | pipe error and process gone, no clean exit; Longshot's crash window | `end_reason=crash_suspected`; do not discard the session; save re-read; never touch Longshot's crash report. |
| **Updating to a new version** | `status.version` changed, or `protocol != 1`, or save `revision` mismatch | Compare to the compatibility matrix; unknown newer version = "untested", degrade to safe features; mismatched revision = rebuild catalogue; never write. A changed game build disables live flags until sanity checks pass. |

## 8. Optional companion modes

- **Second-monitor mode**: a resizable window with large-type panels (map + next goals), auto-fits any display; no overlay injection.
- **Always-on-top mini panel**: Tauri `alwaysOnTop`, borderless, click-through toggle. **Not an in-game overlay**: no process injection and no graphics hooks, which avoids any interaction with Longshot's Vulkan presentation path and anti-cheat-style heuristics. Useful on a single monitor only when the game is windowed/borderless; exclusive fullscreen hides it **[I]**.
- **Phone view**: optional loopback-only server (127.0.0.1) with per-run token, mirroring PR 1655's pattern. LAN exposure is **off and not offered in v1**. A phone on the same network would need a deliberate, separate design (TLS, pairing).
- **Controller navigation**: Gamepad API focus navigation; global gamepad capture would compete with the game for the controller, so only enable when the companion window is focused.

## 9. Performance budget (targets, to be measured)

| Metric | Target | How |
|---|---|---|
| Idle CPU, connected, UI visible | < 1% of one core | sample at 10 Hz, coalesced UI emits, no polling loops in React |
| Idle CPU, window hidden | < 0.3% | pause UI emits |
| RAM | < 150 MB working set | WebView2 baseline dominates; DB streaming queries |
| Game impact | not measurable | the bridge is already built for this: idle path is an atomic check (**[C]**); the companion never calls `status` faster than 1 Hz and never uses `mem_read` |
| Parse time per save | < 50 ms | 120 KB file |

Measurement plan: PresentMon-style frame-time A/B with and without the companion connected (the Longshot docs treat PresentMon as the reference method for frame pacing, `docs/design.md` s.13 **[C]**).

## 10. Testing architecture

- **Unit**: `zn-savefile` round-trip on synthetic saves (byte-identical rewrite property used by PR 1401 as a checker idea **[C]**), MurmurHash3 vectors (cross-check against `host/oot_state_tap.c`'s `state_murmur` constants), `zn-core` aggregators.
- **Contract**: a fake bridge (`zn-testkit`) implementing protocol 1 behaviours listed in `control.md` (out-of-order replies, `more` overflow, dropped sub, stale samples, partial lines, 64 KB overlong lines) driven over a real named pipe in CI on Windows.
- **Golden**: recorded sanitised bridge sessions replayed to check event output.
- **Property/fuzz**: save parser and JSON line reader.
- **E2E**: Playwright against the UI with the backend in fake mode.
- **Manual matrix**: real Windows 10/11, NVIDIA/AMD/Intel, Longshot stable and nightly, each lifecycle state in s.7.
- **Never** commit game data. Fixtures are synthetic or authored.
