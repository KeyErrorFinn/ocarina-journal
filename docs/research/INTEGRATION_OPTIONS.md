# Integration options and recommendation

Pinned Longshot `868f6be871f9` / `v3.0.0`. Tags: **[C]** confirmed in source/docs, **[I]** inference, **[U]** unverified.

## 0. The finding that reshapes the question

The brief assumes no modding API may exist. What exists is better than a mod API for this purpose: a **built-in, opt-in, same-user, local control bridge** (`host/control.c`, `host/oot_state_tap.c`, `docs/control.md`) that already streams Link's position, map, age, hearts, rupees and arbitrary flag values/changes, lists saves, takes screenshots, and speaks versioned newline-delimited JSON over a Windows named pipe. It ships in `v3.0.0`. **[C]** It was built for test tooling and coding agents, but it is documented, tested against a fake game (`tests/test_control.py`, `tests/test_oot_state_tap.py`), and maintainers describe extending it for "companion programs" in issue #42 tier 3. **[C]** A prototype Zelda-Notes-like map already rides on it (PR #1655, WIP, open). **[C]**

## 1. Options

### A. Native Longshot source modification (internal bridge in the host)

Add or extend host-side hooks and expose them. Two flavours:

- **A1. Upstream contributions** to Longshot's bridge (additive fields/events, protocol stays `1`). Maintainers explicitly allow additive growth: "`protocol:1` allows additive fields, commands and explicitly requested event kinds" **[C]**, and have merged similar work (state tap, #58). Contributions must pass their rules (`CONTRIBUTING.md`, `AGENTS.md`: PR template, tests, measurements, "a change the game runs is tested in the game").
- **A2. A private fork.** Maximum freedom, but every Longshot release (the project merged 507 PRs in six days) forces a rebase, and the host contains build-specific guest addresses. High maintenance. **[C]** facts, **[I]** judgement.

### B. Plugin/mod

**[C]** Longshot's mod system is **RomFS file replacement only**. `docs/mods.md`: "A file mod does not supply host code or callbacks. An `exefs` folder is noticed and logged, but its patches are not applied ... Scripts, native libraries and a manifest beside `romfs` are not executed". Issue #42 proposes native modules only as "tier 4, later". ProjectReLink (a Longshot derivative) applies ExeFS IPS/pchtxt patches at build time per its README **[S]**, but that is a different project and still not a host-code API. **Not viable** as the integration channel.

### C. Existing Nintendo service emulation

Longshot's services are mostly stubs that make the game stay offline **[C]** (`nn_applet.c`). Two sub-ideas:

- **C1. Observe `nn::prepo::PlayReport` saves.** `PlayReport::Save` and `Send` are `HLE` no-ops. The report builder (`Add*`, `SetEventId`) is lifted SDK code, so a hook at `Save` could read the finished report out of `this` and forward it. In BOTW the same mechanism carries events such as `korok`, `dungeon`, `gameover`, `getitem` with map, position and play times (leoetlino `botw-re-notes/telemetry.md` **[S]**). If OoT's reports are similar, this is a **ready-made, game-authored event stream including game overs and play time**. Whether OoT sends such reports, which event ids, which fields, and the in-memory layout of `PlayReport`, is **[U]**. It needs a spike with the user's dump. Promising, cheap to test (log the builder state in `Save`), and read-only.
- **C2. Mock the `nn.npln` gRPC backend** so the in-game Zelda Notes menu thinks it is linked and "uploads". **Rejected**: needs a forged network-service-account token or attestation, an unknown schema, and amounts to impersonating Nintendo's service (outside the brief's rules). The phone app could not consume it anyway.

### D. External process memory reading

Read the Longshot process from the companion with `ReadProcessMemory`. Problems: **[I]** from facts:

- Offsets are guest addresses inside a 512 GB reservation whose host base is not shown to be fixed **[U]**. Finding the window means pattern scanning or debug-symbol cooperation.
- Every structure is build-specific (`STATE_GAMEDATA_SLOT 0x84c9e180` etc.) and the typed containers use a hash table with a layout only documented by Longshot's host code.
- Reading concurrently with game threads has no consistency guarantee; Longshot's own code reads on a game thread at Link's update for this reason.
- Windows security: `PROCESS_VM_READ` on another process looks like a cheat tool to anti-malware and needs the same user; some AV flag it.
- It duplicates what the bridge already offers more safely (`mem_read` is gated by `HOS_CONTROL_MEM`).

**Rejected** except as a last-resort debugging aid through the bridge's own `mem_read`.

### E. Save-file monitoring

Read `progress.sav`/`caption.sav` as they change. **[C]** format documented in PR 1401; no Longshot change needed; works with NX2navi/Lichii/emulator saves too. Limits **[C]/[I]**: only as fresh as the game's last write (autosave around transitions; quitting does not force a save); no live position; no events; no play time; no deaths; needs the player's own romfs to turn hashes into names. Excellent as a **fallback and cross-check**, and for the "what is missing" completion model.

### F. Hybrid

Bridge live stream (position, map, flag changes) + save parsing (state not exposed live, historical truth, recovery after reconnect) + optional new upstream events (game over, 64-bit flags, play report). The companion's own SQLite history fills what neither can provide.

## 2. Comparison

Scale: 5 best, 1 worst. Evidence-based; "n/a" where meaningless.

| Criterion | A1 upstream bridge | A2 fork | B mod | C1 prepo hook | C2 mock gRPC | D memory read | E save watch | **F hybrid (bridge + save + A1 patches)** |
|---|---|---|---|---|---|---|---|---|
| Technical feasibility | 5 | 4 | 1 | 3 (spike) | 1 | 2 | 5 | **5** |
| Implementation complexity (5 = low) | 4 | 2 | 1 | 3 | 1 | 2 | 4 | **3** |
| Reliability | 4 | 3 | n/a | 3 | 1 | 2 | 4 | **4** |
| Performance overhead on game | 5 (bounded, atomic deadline check when idle, **[C]**) | 4 | n/a | 5 | n/a | 3 | 5 | **5** |
| Security | 4 (same-user pipe, DACL, no TCP, but no read-only scope) | 3 | n/a | 4 | 1 | 2 | 5 | **4** |
| Compatibility (Longshot builds, other ports) | 3 (Longshot only; ReLink derivative likely inherits **[U]**) | 2 | 1 | 3 | 1 | 1 | 5 (any port with same save format **[I]**) | **4** |
| Ease of install | 4 (one env line in `longshot_env.txt`) | 2 | 1 | 4 | 1 | 4 | 5 | **4** |
| Maintainability | 4 | 1 | n/a | 3 | 1 | 1 | 4 | **4** |
| Resistance to Longshot updates | 4 (protocol versioned, additive; the maintainers own the addresses) | 1 | n/a | 2 | 1 | 1 | 5 | **4** |
| Live gameplay events | 4 | 5 | 1 | 5 if OoT reports exist | n/a | 2 | 1 | **4** |
| Supports every Zelda Notes feature | 3 | 4 | 1 | 3 | 1 | 2 | 2 | **4** (no option reaches Nintendo-server features) |

## 3. Recommendation

**Option F, with the bridge as the live channel and upstream contributions (A1) for the gaps. No fork. Read-only by default.**

Concrete shape:

1. **Live channel:** Windows named pipe to the existing control bridge, protocol `1`, `subscribe events:["oot"]` with `every: 6`, `changes: true`, and a small watched-flags list. The companion enables the bridge by adding one `HOS_CONTROL=<name>` line to `longshot_env.txt` beside the game after explicit user consent, or by launching the game itself with the variable set. **[C]** that the file accepts that line.
2. **Durable truth:** read-only save parsing with the player's own romfs for names/positions; re-sync on map change, on reconnect, and on file change.
3. **Companion-owned history:** SQLite of sessions, samples (down-sampled), events and daily aggregates. This is the only way to produce Today's Record / My Play Data-style statistics given that saves hold no play time.
4. **Upstream patches** (small, additive, each separately reviewable), in priority order:
   1. Expose `Bool64bitKey` lookup/changes (`flags64`) so Gold Skulltulas and heart pieces are live. The internal function exists (`hos_oot_gamedata_bool64`).
   2. Report the game build id and the loaded slot in `status`.
   3. A discrete event `oot_event` for map change completed, game over, and save written (hook `HOS_OOT_TRACE_SAVES` site, `nx2/oot_patches.py`-style).
   4. A **read-only scope** for a connection: e.g. `hello` with `{"readonly":true}` after which input/option/quit/teleport commands reply `forbidden`. This is the one security feature a companion needs that the bridge lacks.
   5. If the C1 spike succeeds: forward finished `PlayReport` contents as `oot_event`s.
5. **Separate, explicit, consented write capability** (phase 5+, optional): e.g. injecting ocarina button presses from a phone-like on-screen ocarina through `press`, or screenshot requests. These are bridge commands the player could already trigger; the companion exposes them only behind a visible toggle and never writes saves or guest memory.

### Why not simply wait for upstream?

Because option F works on `v3.0.0` today with zero upstream changes for position, map, hearts, rupees, chests, enemy-defeat counters and songs; the patches only add precision and events. Phase 1 therefore has no external dependency.

## 4. Known risks of the recommendation

| Risk | Evidence | Mitigation |
|---|---|---|
| Bridge named pipe untested on Windows upstream | `docs/control.md` "Known limits": "CI has no Windows runner ... The bridge inside a Windows game build ... not tested" | Phase 1 acceptance includes a real Windows run; report results upstream; fall back to save watching if it fails. |
| Change scan latency unknown | "real table sizes and cost have not been measured" | Log line `control: oot changes scan:` read at connect; surface it in diagnostics; prefer targeted `flags` for hot values. |
| Guest addresses change with the game build | `oot_state_tap.c` constants | Version gate; refuse to display live data when sanity checks fail; track upstream. |
| Any same-user process can drive the game via the pipe | `docs/control.md` | Use a random per-launch pipe name when the companion launches the game; ask upstream for read-only scope; never expose the pipe or a proxy beyond the machine. |
| The bridge is a developer/agent tool and may change | Header text; protocol is versioned and additive | Pin accepted `protocol` and Longshot versions in a compatibility matrix; contract tests in CI against a recorded fake bridge. |
| Maintainer appetite for companion features unknown | Issue 582 has 0 replies; issue 42 is exploratory | Open an RFC issue citing 582/42/1655 before sending patches; keep patches small. |
| PRs 1401 and 1655 are unmerged | state "open" | Do not depend on their code; reuse only ideas and re-derive; re-check before Phase 2. |
