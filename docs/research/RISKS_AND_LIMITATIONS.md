# Risks, limitations, legal and licensing

**This is not legal advice.** Where law is uncertain the uncertainty is stated, not resolved. Get qualified counsel before publishing a binary, before any APK analysis, and before running any online service.

Tags: **[C]** confirmed in source, **[S]** secondary, **[I]** inference, **[U]** unverified.

## 1. Technical risk register

| # | Risk | Likelihood | Impact | Evidence | Mitigation |
|---|---|---|---|---|---|
| T1 | Windows named pipe of the control bridge misbehaves | **Low after S1** (worked on rc.5, one machine, ~14 min) | **Critical** (live channel) | Upstream: "CI has no Windows runner ... the bridge inside a Windows game build ... not tested" (`docs/control.md`) **[C]** | Phase 0 S1; report bugs upstream; fallback save-watch. |
| T2 | Change-scan latency too high for responsive events | **Resolved: 7 presents (~117 ms)** | Low | "real table sizes and cost have not been measured" **[C]** | Measure in S1; watch targeted flags (`flags`) instead of relying on `changes`; rotate lists. |
| T3 | Hard-coded guest addresses break on a new game build | High over months | High | `oot_state_tap.c` constants for build `e0f3ccfa` **[C]** | Version gate; upstream `build` field; refuse live data on mismatch; track releases. |
| T4 | Bridge is a developer/agent tool; semantics may change | Medium | Medium | protocol is versioned and additive **[C]** | Pin protocol 1; contract tests; compatibility matrix. |
| T5 | 64-bit keys not live | Certain today | Medium | PR 1655 **[C]** | Save fallback; upstream `flags64`. |
| T6 | Saves hold no play time or counters for Today's Record | Certain | Medium | PR 1401 doc **[C]** | App-side accumulation; label approximations; S2/S3 spikes. |
| T7 | Which slot is loaded is unknown | Medium | Low-Medium | `saves` only reports `newest` **[C]** | Heuristic + UI chip; upstream `slot`. |
| T8 | Save format knowledge comes from an unmerged, unreviewed PR | Medium | Medium | PR 1401 open **[C]** | Independent verification on real saves in Phase 2; re-check before relying. |
| T9 | Name recovery from romfs fails or is incomplete | Medium | Medium | PR 1401 reads names from romfs (works for its author) **[C]**, unverified by us | GATE 2. |
| T10 | Autosave frequency makes save-only features laggy | Medium | Low-Medium | `HOS_OOT_TRACE_SAVES` implies autosave on transitions **[C]**, cadence **[U]** | Live events as hints; label "confirmed on next save". |
| T11 | Partial reads while the game writes | Low-Medium | Low | atomicity **[U]** | share-mode reads, validation, retry, never trust a failed parse. |
| T12 | Longshot is experimental; the game crashes frequently in places | High | Low for us | README: Hyrule Field, Castle Town, Kakariko have crash/freeze issues; many auto-generated crash issues **[C]** | crash-tolerant sessions (`end_reason=crash_suspected`). |
| T13 | First launch preparation takes long (shader/pipeline build; hours on some Intel Arc) | Medium | Low | issue #1706; `docs/control.md` **[C]** | "Starting" state with no false errors. |
| T14 | WebView2 missing on some Windows 10 installs | Low | Medium | **[I]** | bootstrapper in installer. |
| T15 | Companion CPU/RAM competes with a CPU-bound game | Medium | Medium | `docs/design.md` rule 7 **[C]** | budgets and A/B measurement; reduce sample rate in battery/perf mode. |
| T16 | Upstream unreceptive to patches | Medium | Medium | issue #582 has no reply **[C]** | patches are optional; features degrade gracefully. |
| T17 | Another local process drives the game through the pipe | Low | High | no read-only scope **[C]** | random pipe name, upstream read-only scope, never expose the pipe. |
| T18 | Global statistics abuse | n/a | n/a | the bridge can teleport and write memory **[C]** | defer community service. |
| T19 | Misleading numbers | Medium | Medium | approximations | per-metric provenance labels, `n/a` over 0. |

## 2. Limitations of this investigation

- APK analysis was **static only**: no device, no account, no traffic, PairIP not bypassed, strings not systematically deobfuscated. The Zelda Notes web content and the game-to-server protocol are unobserved (see `ZELDA_NOTES_REVERSE_ENGINEERING.md`).
- Longshot was not executed (a dump and a built rc.5 exist on the user's machine); the Windows pipe and bridge timings are untested by me, and the save layout was not yet checked against the user's six real slots.
- Hookshot, ProjectReLink, NX2navi, Lichii and the community save editors were not code-reviewed.
- The official OoT feature list is from secondary sources and contradicts itself in places.
- Save-format facts rely on one unmerged PR and its own tests.
- `host/hos_mem.c`, `nn_fs.c`, `hos_svc.c`, `vk_menu.cpp`, `oot_menu.c` and the Launcher repository were not read.
- Estimates are judgement.

## 3. Legal and licensing

### 3.1 Longshot licence and our relationship to it

**Release provenance review, 2026-11-22:** the repository includes the full GPL-3.0 text and distributes under
GPL-3.0-or-later. The catalogue rules are conservatively treated as adapted GPL work from mooki's save-editor
contribution and TrashPanda's live-map work, rather than relying on an independent-language exemption. The
retained source evidence, exact snapshot checksums, attribution and distribution basis are recorded in
[LICENSING_PROVENANCE.md](LICENSING_PROVENANCE.md), with notices in
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). No new permission or upstream endorsement is claimed.
General Nintendo IP risks below remain; this review does not authorise distributing game data.

- Longshot: **GPL-3.0-or-later** for the whole project **[C]** (`LICENSE`, README). Contains GPL third-party code (suyu GPL-2.0-or-later, Eden GPL-3.0) **[C]** `docs/design.md` s.8.
- **Our companion is a separate process** that talks to Longshot over a pipe using a documented protocol. Under the common reading of the GPL, communicating over a socket/pipe with a separate program does not by itself make our program a derivative work **[I]**. This is a legal judgement, not a settled fact.
- **Do not copy Longshot code** (including `longshot_ctl.py`, `oot_state_tap.c`, PR 1401/1655 scripts) into a non-GPL codebase. Re-implement from the documented protocol. If any code is copied, the combined work must be GPL-3.0-or-later.
- **Recommendation:** license the companion **GPL-3.0-or-later** (or AGPL if a service is ever hosted). It removes the reuse question, matches the ecosystem (Longshot, ProjectReLink, Lichii are GPL-3.0), and permits studying and adapting upstream code. MIT-licensed community editors (OOT-SW2SE, dlr-developer) can be read and reused with attribution inside a GPL project.
- **Upstream patches** to Longshot are by definition GPL-3.0-or-later and must follow its contribution rules: **"no game files, keys or anything made from them leave the PC"** (`AGENTS.md`, `CONTRIBUTING.md` **[C]**). Our fixtures and tests must contain none.
- Cloowney's editor has **no licence file**; do not reuse its code.
- nxapi is **AGPL-3.0**: if any of its code is ever used, AGPL obligations apply; we do not plan to use it.

### 3.2 Third-party libraries

Tauri (Apache-2.0/MIT), React (MIT), Vite (MIT), tokio (MIT), serde (MIT/Apache-2.0), rusqlite (MIT) with bundled SQLite (public domain), zstd crates (MIT/Apache-2.0, bundling zstd BSD/GPLv2 dual), notify (CC0/Artistic), gilrs (MIT/Apache-2.0). Versions pinned and audited with `cargo deny` and a licence report at release. **[I]** general knowledge of these ecosystems; verify at pin time.

### 3.3 Nintendo intellectual property

Uncertain and the largest legal exposure.

- **Do not distribute:** game files, derived tables (hash-to-name dictionaries, item/quest/enemy name lists, placement coordinates extracted from the game, map renders, item icons, textures, audio, message text), keys, Nintendo source code, the Switch App's assets, strings, quiz questions, Gossip Quest photos, or Nintendo marks as branding.
- **Allowed by design:** a tool that reads the player's *own* files on the player's machine at runtime and caches the result locally, as PR 1401 does ("ships nothing of [the game]") **[C]**. Whether even that is acceptable is a policy and legal question for counsel; Longshot's maintainers accept it only for the player's own copy.
- **Name and trade dress:** do not use "Zelda Notes", "Zelda", "Nintendo", "Hylian", "Navi", Triforce or Nintendo's visual language in the product name or marketing. Use a neutral working title. Describe compatibility factually ("works with Longshot").
- **Reimplementation of application functionality:** functional ideas are generally not protected the way expression is, but the Gossip Quest *content*, quiz *questions*, art, sound and text are. We recreate behaviours, not content. Whether closely mirroring the app's feature set and screen flow raises trade-dress or unfair-competition concerns is **uncertain**; mitigated by an original visual language and different feature names ("Location Quests").
- **Song melodies** (Play Ocarina): the twelve songs are Nintendo compositions. Encoding them as note sequences may be tolerable fan use or may not; **uncertain**. Default build ships no song data; players can enter or import their own scores.
- **Reverse engineering restrictions:** the Nintendo Switch App's terms and the game's EULA may prohibit reverse engineering; enforceability varies by jurisdiction (some allow interoperability exceptions). **Uncertain**; do not analyse the app without counsel's sign-off. Longshot itself is a legal grey area built on the user's own dump and static recompilation; its legal standing is not ours to assert.
- **Do not circumvent DRM, authentication or security controls.** No mock of Nintendo's gRPC backend, no forged tokens, no attestation bypass, no certificate-pinning bypass.
- **Nintendo takedowns:** projects in this space may receive DMCA notices; keep the repository free of any game-derived content so a notice has nothing to point at, and keep a clean-room record of how formats were learned (the PR 1401 route reads data from a player's own files).

### 3.4 Privacy and data protection

- Zero network by default. No telemetry. No update checks without opt-in.
- Local DB contains play behaviour (timestamps, positions); it is personal data under GDPR-style regimes if it leaves the device. Provide export, delete-all, and a documented schema.
- Optional community service: separate consent, aggregate counters only, no identifiers beyond a random install id the user can reset, retention limits, a published privacy policy, and age-of-consent considerations for the target audience.
- Never upload saves, screenshots, positions, or NFC tag dumps.

### 3.5 Windows security considerations

- Do not inject into or attach to the game process; do not use `ReadProcessMemory`.
- Editing `longshot_env.txt`: only with explicit consent, show the exact line, back up the file, never touch other lines, never set `HOS_CONTROL_MEM` or `HOS_CONTROL_PEER_SID`.
- Pipe name: random per launch when we launch the game; validate the server by checking the pipe's server process is `longshot.exe` (via `GetNamedPipeServerProcessId`, which the upstream client also uses **[C]** in `docs/control.md` sessions).
- Signed installer and updates; no auto-elevation; per-user install by default; no firewall rules needed (no listening sockets except the optional loopback view).
- Anti-cheat/AV: no hooking, no overlay injection, no driver.
- Safe parsing: all file and pipe input is untrusted (size caps, bounds checks, fuzzing).

### 3.6 Relying on undocumented services

The control bridge is documented but evolving and primarily for tools/agents; the game's gRPC channel is undocumented and unused by us; the save format is documented only in an open PR. Each is covered by version gating and graceful degradation. Our design never depends on Nintendo's services.

## 4. Unavoidable limitations of any local alternative

- **No global data.** "Global Play Data" cannot be Nintendo's.
- **No official content.** Gossip Quest photos, point values and unlock lists, quiz bank, voice and art are Nintendo's.
- **No history before installation** for statistics the save does not hold.
- **Not an in-game integration.** The in-game Zelda Notes setup screen will not link (Longshot stays offline by design).
- **Dependent on Longshot** (or another port exposing the same structures). The remake on real Switch 2 hardware cannot be connected to this app (no analogous bridge).
- **Single game build.** Supports the build Longshot supports.
