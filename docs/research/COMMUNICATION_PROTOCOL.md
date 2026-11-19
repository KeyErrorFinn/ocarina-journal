# Longshot-to-PC communication layer

Two things are specified here and kept strictly apart:

- **Part I: the existing Longshot control bridge, protocol 1.** Facts from `docs/control.md` and `host/oot_state_tap.c` at `v3.0.0`/`868f6be871f9`. The companion is a client of this, unchanged. **[C]**
- **Part II: the companion's own normalised schemas and internal events.** Our design. **Proposed.**
- **Part III: proposed additive upstream extensions.** Proposals only. None exists today; each must be accepted upstream before the companion relies on it, and each is optional (the companion degrades without it).

Nothing in Part II or III is a Longshot or Nintendo API.

## 1. Transport evaluation

| Candidate | Verdict | Reason (evidence) |
|---|---|---|
| **Windows named pipe** to the control bridge | **Chosen** | Exists, tested against a fake game, DACL protected, `PIPE_REJECT_REMOTE_CLIENTS`, "never TCP" **[C]**. Rust: `tokio::net::windows::named_pipe::ClientOptions` **[I]** (standard tokio API; untested here against this server). |
| Local TCP / HTTP / WebSocket from the game | Not available | The bridge refuses TCP by design **[C]**. Adding one would widen the attack surface for no gain. |
| Shared memory | Rejected | No such mechanism in Longshot; would duplicate the state tap's locking problems. |
| Local HTTP/WebSocket from the **companion** to its own UI | Not needed | Tauri 2 IPC (commands and events) is in-process. A loopback HTTP server is only used by the **optional** second-screen/phone-view mode and binds 127.0.0.1 only (see s.8 of `COMPANION_APP_ARCHITECTURE.md`). |
| Native Tauri integration | Yes for UI<->backend | Not for game<->backend. |

Windows caveat **[C]**: the bridge on Windows is untested in upstream CI. Phase 1 must prove it on real hardware.

## Part I: the existing bridge (protocol 1)

### I.1 Enabling, naming, security **[C]**

- Off unless `HOS_CONTROL` is set. On Windows the value is a pipe: `\\.\pipe\<name>`; a bare name gets the prefix (`host/control.c` 2272-2273).
- Can be set from `longshot_env.txt` beside the game because the file accepts `HOS_*` names with a value containing no `/`, `\`, drive letter or `~` (`host/hos_main.c` 502-535). `HOS_CONTROL_PEER_SID` is refused from the file; `HOS_CONTROL_MEM` is not, so **never write that line**.
- DACL: the current user (full) plus the game's AppContainer SID when sandboxed; remote clients rejected; `FILE_FLAG_FIRST_PIPE_INSTANCE` stops name squatting by another process starting later. A **pre-existing** pipe of the same name created by another process before the game would make the bridge fail to start ("another game listens there?"), logged. **[C]**
- Limits: 64 KB per request line, 8 clients, 64 pending requests, 256 queued inputs, 8 MB unread output before a client is dropped.
- A client has the player's full power over the game (`press`, `quit`, `shot` to any writable path, `option_set`, `teleport`) **[C]**. There is no read-only scoping.

### I.2 Message framing **[C]**

One JSON object per line. Replies carry the request `id` and the game's `frame` (presents so far). Replies may arrive out of order. Event lines have an `"event"` key and no `"ok"`. Errors: `bad_json, too_long, bad_request, unknown_cmd, timeout, busy, unavailable, forbidden, out_of_range, not_found, failed, refused, cancelled`. `protocol: 1` allows additive fields, commands and explicitly requested event kinds; clients ignore unknown fields.

### I.3 Commands the companion uses

| Command | Use | Notes |
|---|---|---|
| `status` | handshake and health | Reply: `frame, protocol, fps, state(boot/intro/menu/loading/play/unknown), stalled, draws, replayed, window, uptime, clients, input, map, game{...}, version, renderer`. `state` is a guess from draw counts. `game` is the last Link-update snapshot; compare `game.frame` to `frame` for staleness. |
| `subscribe` | live stream | `events` from `present,state,log,map,oot`; `every` 1..216000 presents (default 60); `flags` up to 64 names (1-47 chars of letters, digits, `_`, `.`) or `0x%08x`; `changes:true`. A second `subscribe` replaces the first on that connection. |
| `saves` | slot discovery | no opt-in; `slots[{slot,mtime,newest,files[],caption?}]`, `path`, `account`, `option`. `unavailable` until the game opened its saves. |
| `shot` | Photo Studio | PNG of next present; `path` optional, relative paths resolve inside the socket folder (Windows: `%TEMP%\longshot-control-<pipe>\`). |
| `wait` | tests/diagnostics | not needed in the app. |
| `option_get` | read-only | reading is harmless; `option_set` is **not** used. |

Commands **never** sent by default: `press`, `stick`, `sequence`, `release`, `option_set`, `teleport`, `age`, `quit`, `relaunch`, `mem_read*`, `mem_write`.

### I.4 The `oot` event, field by field **[C]**

```json
{"event":"oot","sub":11,"frame":6002,"game":{
  "t":102.1,"frame":6001,"map":"KokiriForest_Child","pos":[0.0,0.0,0.0],
  "facing":0.0,"camera":0.0,"event":false,"loading":false,"age":"child",
  "life":12,"max_life":12,"rupees":0,"prompt":"...","music":"...",
  "flags":{"PlayerStatus.Life":12,"0x31ab5580":12},
  "changed":{"0x31ab5580":11},"more":0}}
```

- `t` host monotonic seconds; `frame` present number at sampling; envelope `frame` is the bridge's current present.
- `pos` metres; `facing`/`camera` degrees (0 = +z, 90 = +x); `life`, `max_life` quarter hearts.
- `flags` values: Bool/Int as numbers, Float as `%.3f`, Enum as `"#xxxxxxxx"` (MurmurHash3 of the enum value's name), String64 as string, UInt as number; absent/unreadable as `null`.
- `changed`: keyed by `"0x%08x"` hash. Int as signed, Enum as `"#hash"`, Bool/UInt as unsigned. At most 32 per sample; `more` counts the omitted. Nonzero `more` means re-read the flags you care about. The first sample reports `{}` (baseline).
- Samples stop while Link is not updated; the old snapshot is not repeated.
- Cost: with no pending `status` and no due subscriber the tap returns after an atomic deadline check **[C]**.

### I.5 What the bridge does **not** provide (so the companion must compensate) **[C]**

Float and String64 changes; `Bool64bitKey` flags; Struct flags; names for hashes; the loaded slot; the game build id; discrete events; a read-only connection mode; any push of "save written".

## Part II: the companion's normalised model (proposed)

The Rust core converts raw bridge JSON into these. They are the contract between the backend, the SQLite schema and the React UI (via Tauri). Versioned with `schema: 1`. Field names are ours.

All times: `t_ms` = milliseconds since Unix epoch (companion clock) unless named `game_t`. Positions in metres. Hearts in quarters.

### II.1 ConnectionStatus

```json
{ "schema":1, "state":"connected",
  "detail":{"pipe":"zn-4f3a9c","longshot_version":"3.0.0-...","protocol":1,
            "game_state":"play","stalled":false,"fps":59.8,"last_sample_age_ms":96,
            "bridge_features":["oot","saves","shot"],"scan_slots":null},
  "since_ms":1763541000000 }
```

`state` in `no_longshot | not_running | bridge_off | connecting | handshaking | connected | game_stalled | reconnecting | incompatible | error`.

### II.2 SessionInfo

```json
{ "session_id":"01JD...", "started_ms":..., "ended_ms":null, "longshot_version":"3.0.0",
  "game_build":null, "protocol":1, "slot":"03", "profile_id":"5a3c...", "end_reason":null }
```

`end_reason` in `clean | game_exit | disconnect | crash_suspected | app_exit`.

### II.3 PlayerState (one per accepted sample)

```json
{ "session_id":"...", "t_ms":..., "game_t":102.1, "game_frame":6001,
  "map":"KokiriForest_Child", "area":"KokiriForest", "age":"child",
  "pos":[x,y,z], "facing_deg":0.0, "camera_deg":0.0,
  "hearts_quarters":{"current":12,"max":12}, "rupees":0,
  "in_event":false, "loading":false, "prompt":null, "music":null, "fresh":true }
```

`fresh:false` when `game.frame` lags the envelope `frame` by more than the freshness budget (default 30 presents).

### II.4 Inventory

```json
{ "slot":"03", "revision":"<GameDataList rev>", "source":"save|live|merged", "t_ms":...,
  "owned":["Weapon_Sword_Kokiri","Item_Melody_ZeldaLullaby"],
  "counts":{"Item_Bomb":12,"Item_DekuStick":5},
  "songs":["Item_Melody_ZeldaLullaby"], "caps":{"Item_Bomb":20} }
```

Keys are the game's own actor/row names (read from the player's romfs, not shipped).

### II.5 MapLocation

```json
{ "map":"HyruleField_Child", "area":"HyruleField",
  "pos":[..], "trail_tail":[[x,z],...], "visited_area_count":7 }
```

### II.6 CollectibleEvent

```json
{ "id":"01JD...", "t_ms":..., "slot":"03", "kind":"chest|skulltula|heart_piece|heart_container|key|map|compass|boss_key|song|item",
  "ref":{"flag_hash":"0x31ab5580"|null,"key64":"0x..."|null,"entry_id":"chest:KokiriForest:3"},
  "area":"KokiriForest", "pos":[..]|null, "source":"live_flag|save_diff", "confidence":"exact|approx" }
```

`source:"save_diff"` events carry a timestamp of when the file change was *noticed*, not when the item was obtained, and `confidence:"approx"`.

### II.7 QuestProgress

```json
{ "slot":"03","quest":"Step_<name>","category":"story|side|minigame",
  "step":3,"last_step":5,"state":"not_started|in_progress|complete","t_ms":... }
```

### II.8 DeathEvent

```json
{ "id":"...","t_ms":..., "map":"...","pos":[..]|null,
  "detect":"life_zero_event|game_over_event", "confidence":"heuristic|exact" }
```

`game_over_event` exists only if upstream adds it (Part III).

**Measured correction (spike S1 run 2):** in `v3.0.0-rc.5`, Link reaching `life == 0` set `event == true` and, ~300 frames later, `life` returned to 20 with **no map change, no `loading`, and `state` still `play`** (an in-place revival). A heuristic of "life zero, then a map load" would **miss** this. Detect `life == 0 && event == true` as a `death` candidate, then classify as `revived` if `life > 0` returns within ~10 s without a map change, else `game_over` if a load or title follows. A true game over was not observed.

### II.9 StatisticsDelta and DailyStats

```json
{ "day":"2026-11-19", "tz":"Europe/London", "slot":"03",
  "play_seconds":3120, "enemies_defeated":41, "rupees_gained":380, "hearts_lost_quarters":22,
  "game_overs":1, "distance_m":5210.4, "grass_cut":null, "jumps":null,
  "measured_by":"companion", "gaps_s":0 }
```

`null` means "no source yet", never zero.

### II.10 Tauri events and commands (UI contract)

| Direction | Name | Payload |
|---|---|---|
| backend -> UI event | `conn://status` | ConnectionStatus |
| | `game://player` | PlayerState (throttled to <=10 Hz to the UI) |
| | `game://collectible` | CollectibleEvent |
| | `game://quest` | QuestProgress |
| | `game://death` | DeathEvent |
| | `data://changed` | `{table, slot, rev}` so the UI refetches from SQLite |
| UI -> backend command | `get_snapshot(slot)` | full state for initial render |
| | `list_slots()`, `select_slot(id)` | |
| | `query_events({slot,kind,from,to,limit,cursor})` | |
| | `set_setting(key,value)`, `enable_bridge(consent)`, `disable_bridge()` | |

## Part II: behaviour

### Initial full-state sync

1. Resolve game folder and save folder (settings or auto-discovery).
2. Connect, `status`, check `protocol == 1`.
3. `saves` -> pick the `newest` slot (or the user's choice).
4. Read and parse `progress.sav` copy -> baseline `Inventory`, `Collectibles`, `QuestProgress` (source `save`).
5. `subscribe oot every:6 changes:true flags:[hot list]` -> first sample is a baseline, then deltas.
6. UI is told `data://changed` after each step.

### Incremental updates

- Each `oot` sample -> `PlayerState`, down-sampled into SQLite (trail points at >=0.25 m spacing, stats deltas at every sample).
- `changed` hashes -> dictionary lookup (hash -> name, built from romfs) -> events. Unknown hash: stored raw, not shown.
- If `more > 0`: re-read watched flags and re-diff against the last save snapshot.
- On `map` event or `loading` true-to-false: schedule a save re-read in 1.5 s and again at 5 s.

### Save-slot changes

`saves` poll every 5 s while connected (cheap, no guest read). A change of `newest` or a slot's mtime triggers a re-parse; a **different loaded slot** is **[U]** from the bridge, so the companion treats "newest" as the loaded slot and flags the ambiguity in the UI until upstream exposes it.

### Connection loss, reconnect, version negotiation

- Backoff 0.5, 1, 2, 5 s then every 5 s; reconnect never blocks UI.
- `incompatible` if `protocol != 1`. Unknown fields ignored. Unknown commands only from the compatibility list.
- On reconnect: new `SessionInfo`; baseline reset (the first `oot` sample after subscribe has `changed:{}`), so deltas across the gap are computed against the last known save snapshot, flagged `gap`.
- On `relaunch` (Windows: new process): reconnect on the same pipe name; the old connection errors, the new `status.uptime` is small.

### Backpressure and rate limiting

- `every:6` ~ 10 Hz at 60 fps; user setting `1x/2x/4x slow` maps to 6/12/24. Never lower than 3.
- The reader task drains the pipe into a bounded channel (capacity 256). If full, the **oldest** non-event sample is dropped and a `dropped_samples` counter surfaces in diagnostics. A subscriber that does not drain gets dropped by the game at 8 MB; the reader therefore must always read.
- UI emission is throttled and coalesced separately from persistence.
- Flag watch list <= 64 names; rotate watch lists across presents if more are needed rather than relying on `changes` alone.

### Error reporting

Typed errors (`BridgeError::{Unavailable, Forbidden, Busy, Timeout, Protocol, Io}`) are logged, shown as a collapsible diagnostics panel, and counted. Never include save contents in logs. A "Copy diagnostics" action redacts user names and paths (Longshot's own logs already "leave out your user name" per v3.0.0 notes).

## Part III: proposed upstream extensions (additive, protocol stays 1)

Each is optional for the companion. Each would be one small PR with tests in the style of `tests/test_oot_state_tap.py`.

1. **`flags64`** in `subscribe`: watch up to N 64-bit ids (hex strings) in the `Bool64bitKey` container; sample gets `"flags64":{"0x...":1}`; `changes64:true` for first-time-true keys. Internal function `hos_oot_gamedata_bool64` (`oot_state_tap.c` 174) already does the lookup. Container layout is verified for heart containers; Gold Skulltula/heart-piece keys in the same container are **[I]**.
2. **`status.game.build`** (the main build id) and **`status.game.slot`** (loaded slot).
3. **Discrete events** under a new explicit `events:["oot_event"]`: `map_changed{from,to}`, `game_over`, `save_written{slot}`. Hook points: map name write, life reaching zero, the save site traced by `HOS_OOT_TRACE_SAVES` (`hos_main.c` ~619).
4. **Read-only connection**: `{"cmd":"hello","scope":"read"}`; after it any input, option write, teleport, age, quit, relaunch, mem command, or `shot` with a custom path replies `forbidden`. This turns "read-only by default" into something the server can enforce.
5. **Play report tap** (only if the spike shows value): `oot_event{kind:"play_report", event_id, fields{}}`.

Until accepted upstream, a feature depending on a proposal is shown as "needs Longshot update" in the UI and the app uses its fallback (save diff, heuristic).

## Capability separation (read-only by default)

| Capability | Commands | Default | Needs |
|---|---|---|---|
| **Observe** | `status`, `subscribe`, `saves`, `option_get` | on | user enabled the bridge |
| **Capture** | `shot` | on-demand, default path only | user presses "Take photo" |
| **Drive input** | `press`, `stick`, `sequence`, `release` | **off** | explicit toggle with confirmation dialog explaining the game can be controlled; auto-off at disconnect |
| **Game edits** | `option_set`, `teleport`, `age` | **never in v1** | not implemented |
| **Process control** | `quit`, `relaunch` | **never** except app "Stop game" opt-in | explicit button |
| **Memory** | `mem_*` | **never** | requires `HOS_CONTROL_MEM`; the companion neither requires nor sets it |

## Security boundaries

- The pipe is same-user only and never TCP **[C]**; the companion does not proxy it.
- The companion generates a random pipe name per launch when it launches the game (`zn-<8 hex>`), so another local process cannot pre-create it before the game and cannot guess it. When the player launches the game via the Longshot Launcher with a fixed name in `longshot_env.txt`, a fixed name is used and the first-instance protection still holds on the game side **[C]**.
- The optional phone/second-screen view serves only 127.0.0.1 and `::1`, refuses other bind addresses (as PR 1655's `serve()` does **[C]**), uses a per-run token in the URL, and carries no pipe access.
- Never forward the pipe, saves, or state off the machine by default. The community-stats service is a separate, off-by-default uploader of aggregates only.
- Never write `HOS_CONTROL_MEM` or `HOS_CONTROL_PEER_SID`.
- Treat everything from the pipe as untrusted input: bounded line reads (<= 1 MB cap in our reader though the game sends <= 8 MB queued), JSON depth limit, string length limits, UTF-8 validation. The bridge states its own client "trusts the game no further than it must" **[C]**; do the same.
