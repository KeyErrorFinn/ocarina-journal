# Longshot architecture, as it matters to a companion app

Pinned: `main` `868f6be871f9` (2026-11-19) and stable `v3.0.0`. See `RESEARCH_SOURCES.md`. Tags: **[C]** confirmed in source, **[I]** inference, **[U]** unverified.

## 1. What Longshot is

A native x86-64 Windows/Linux build of the Switch 2 remake of Ocarina of Time. Its AArch64 code is translated to C ahead of time from the user's own decrypted dump and compiled with clang; the Horizon OS and NVN2 graphics API are implemented natively; GPU work is replayed on Vulkan 1.3. There is no CPU or GPU emulation. **[C]** `docs/design.md` s.1 and s.3.

It is a fork of mkw-recomp (Mario Kart World) and continues Hookshot, GPL-3.0-or-later. The game's executable is generated on the player's PC by the Longshot Builder, driven by the Longshot Launcher (a separate repo, `MagicBeanDev/LongshotLauncher`, not read). **[C]** README, `docs/design.md` s.2.

## 2. Pipeline

```
 exefs/{rtld,main,subsdk0,sdk} + romfs     user's own dump (never in the repo)
   -> nx2/nso2.py, a64-kit            load NSOs (ZBIC, LZ4), DT_RELR + RELA relocations
   -> nx2/image.py                    image at guest 0x80000000
   -> a64-kit lifter + nx2/insn.py    one C function per guest function
   -> clang -O1/-O2(hot) + lld        longshot.exe  (+ longshot_vk.dll, the only renderer)
```

**[C]** `docs/design.md` s.3. Numbers from the dump: 294,450 lifted functions in 57 chunks, 485 HLE functions, 243 OS imports stubbed (s.9, S2).

## 3. Host and guest memory

- A 512 GB virtual reservation; image at guest `0x80000000`, heap from `0x1000000000` (64 GB), address regions growing down from 512 GB; committed on demand. **[C]** `docs/design.md` s.3, `host/hos.h`, `docs/control.md` "Guest memory".
- Guest pointers are used as offsets into a host window: `hos_guest_range(addr, len)` returns a host pointer for a range inside mapped guest memory or `NULL`. Used for every safe read in `host/oot_state_tap.c` (`state_peek`). **[C]**
- Whether the host base address of the window is fixed or randomised across runs is **[U]**: `host/hos_mem.c` was not read. This matters only for rejected option D (external memory reads).

## 4. Service layer ("Horizon OS" reimplementation)

The SDK is replaced at the `nn::` boundary: `HLE(<mangled name>)` functions in `host/` stand in for OS-facing SDK functions; the rest of the SDK (libc, nn::util, the NVN2 front end) runs as lifted code. Unimplemented OS imports get generated stubs that log their first call. **[C]** `docs/design.md` s.3.

Files by role (all **[C]**, directory listing of `host/`):

| Area | Files |
|---|---|
| Entry, memory, threads, SVCs | `hos_main.c`, `hos_mem.c`, `hos_thread.c`, `hos_svc.c`, `nn_os_sync.c`, `hos_setjmp.c` |
| Applet, account, time, prepo, error | `nn_applet.c` |
| Filesystem (romfs, save data, mods) | `nn_fs.c`, `mods.c`, `game_layout.c`, `options_path.c` |
| Input | `nn_hid.c`, `pad_sdl.c`, `pad_switch2.c`, `hos_sdl.c` |
| NFC (amiibo) | `nn_nfp.c` |
| Audio, microphone | `nn_audio.c`, `nn_audio_in.c`, `oot_voice.c` |
| Video and GPU | `nn_vi.c`, `nvn_native.c`, `nvn_layout.c`, `gpu/vk/*` |
| OoT-specific host hooks | `oot_state_tap.c`, `oot_heart_containers.c`, `oot_area_names.c`, `oot_damage.c`, `oot_menu.c`, `oot_autoload.c`, `oot_barrier.c`, `oot_fov.c`, `oot_high_fps.c`, `oot_shadow.c`, `oot_text_size.c`, `oot_tex_compact.c` |
| Tooling | `control.c`, `control.h`, `discord_activity.c`, `discord_rpc.c`, `hos_crash_*.c`, `hos_report_*` |

### How a game call reaches the host

1. Lifted game code calls an SDK function symbol.
2. If an `HLE(_ZN2nn...)` exists, the host function runs with `Ctx *c` (guest registers). `ARG(n)`, `RET(v)`, `GP(guestaddr)`, `G64/G32` read and write guest memory. **[C]** `host/nn_applet.c`.
3. Otherwise the SDK's own lifted code runs, possibly reaching an IPC stub (`sm:` returns empty replies offline). **[C]** `docs/design.md` s.9 ("Offline answers: ConnectToNamedPort gives a session whose requests are answered empty").

### Patching game code (hooks inside lifted functions)

`nx2/oot_patches.py` rewrites the generated C for chosen guest functions at lift time. Example: `patch_movement` inserts `hos_oot_lift_player(c, c->x[19]);` before an anchor line in Link's movement update, plus a `#include` of the extern. The same mechanism patches damage (`hos_oot_damage`) and flight. Patches are anchored on exact text and return `None` when the anchor is missing or ambiguous. **[C]** `nx2/oot_patches.py` lines ~100-140.

Consequence: **a new host-side event needs a lift-time patch plus a rebuild** (the launcher rebuilds on update, about 10 minutes first time, seconds if nothing changed, per v3.0.0 notes). Host code can call guest functions too (`a64_lookup(addr)` then call with a saved/restored `Ctx`), as the debug inventory tools do (`oot_pouch_change`, `oot_pouch_count` in `host/hos_main.c`). All such addresses are specific to build `e0f3ccfa`. **[C]**

### Threading

Guest threads run as host threads. Link's update runs on a guest worker; `hos_oot_lift_player` serialises with `cheats_lock`. The bridge has its own thread that does all socket I/O and never blocks the game. **[C]** `host/oot_state_tap.c` header, `docs/control.md` "Security".

## 5. Filesystem and saves

- Game romfs is read in place from the player's build; `mods/` folders overlay it (file replacement only). `host/mods.c`, `docs/mods.md`. **[C]**
- Saves: `account.sav`, `option.sav`, and `slot_NN/{progress.sav,caption.sav}`. Locations: `%APPDATA%\Longshot\save\` (installed launcher), `LongshotLauncher-data\user\save\` (portable), `<game folder>\user\save\` (older launcher or direct start), `~/.local/share/longshot/save/` (Linux). `docs/saves.md`. **[C]**
- The bridge `saves` command lists slots and file mtimes without opt-ins. It returns a parsed `caption` (scene, map, JPEG thumbnail offset) only for the layout seen on Kokiri Forest saves. `docs/control.md` "Saves". **[C]**
- A normal quit does **not** wait for the guest to save (`docs/control.md` `quit`, `docs/development.md` "Stopping a windowless game"). v3.0.0 release notes separately claim "Closing the game waits for a save it's writing", i.e. the window-close path differs from the bridge `quit`. **[C]** both, reconciliation **[U]**.
- How often the game autosaves, and whether it writes via temp-file+rename, is **[U]**. The env switch `HOS_OOT_TRACE_SAVES` logs "save trace" lines with reason/mode and "transition autosave suppressed" (`host/hos_main.c` ~619-628), so the game does autosave on map transitions and Longshot can suppress some of them. **[C]** existence, **[U]** frequency.

## 6. Nintendo service emulation: what the game asks and gets

All **[C]** from `host/nn_applet.c` unless noted.

| Interface | Longshot behaviour |
|---|---|
| `nn::account` | One fake user "Player". `IsNetworkServiceAccountAvailable` writes `false`. `EnsureNetworkServiceAccountAvailable` returns error `0x7C7C`. `GetNetworkServiceAccountId` returns 0 and `0x7C7C`. `EnsureNetworkServiceAccountIdTokenCacheAsync` returns account module 124 / description 280. |
| `nn::nsd::GetEnvironmentIdentifier` | Writes `"lp1"`. The game only checks for a `"t-"` prefix. |
| `nn::socket::detail::Poll` | Nothing ever ready; waits out the timeout in <=50 ms steps. |
| `nn::prepo::PlayReport::Save` / `Send(Uid)` | **Return 0 and drop the report.** `AsyncContext` completes immediately. The comment states the report builder (`Add*`, `SetEventId`) is the SDK's own code and runs lifted. |
| `nn::oe` | Docked console, English by default; `GetProgramTotalActiveTime` returns host time since boot. |
| `nn::time` | Host clock. |
| `nn::nfp` | Full implementation from tag files or a Switch 2 Pro Controller reader (`docs/nfc.md`). |

### Existing Zelda Notes surface in the game, as seen from Longshot

- The title menu renders "New Game / Options / ZELDA NOTES Setting" (`docs/design.md` s.9 S3). **[C]** Menu exists; its behaviour offline is **[U]**.
- The game contains a gRPC client in an `nn.npln.*` thread family (`nn.npln.GrpcDispatcher`, `nn.npln.Worker`, `nn.npln.Callback`, `nn.npln.Shared`, `npln-grpc_default-executor`, `npln-grpc_resolver-executor`, `npln-grpc_grpc_global_timer`). Longshot answers its socket poll with "nothing ready" and its account-token call with an error so its worker takes the error branch. `docs/cpu-profile.md`, `host/nn_applet.c` lines 281-309, `host/hos_thread.c` line 1576. **[C]**
- That `npln` is the Zelda Notes channel is **[I]**, not stated anywhere in the repo. Evidence for: 1.1.1 is the patch that "adds Zelda Notes support" **[S]**; the client needs a network-service-account token, matching "needs a Nintendo Account"; it is a gRPC stack in a game that otherwise needs no network. Evidence against / unknown: it may also serve other online features (e.g. telemetry). The `.proto` definitions live in the game binary and were not examined **[U]**.
- No file in Longshot mentions "Zelda Notes" as a feature except the menu string in `docs/design.md`. No issue except #582 and PR #1655 does. **[C]**

Conclusion: **there is no existing Zelda Notes service integration to adapt.** What exists is (a) failures injected so the offline game does not hang, and (b) a general local control bridge. Adapting (a) would mean pretending to be Nintendo's backend; see `INTEGRATION_OPTIONS.md` option C for why that is rejected.

## 7. Input and rendering (what a companion can and cannot touch)

- Input: `host/nn_hid.c` merges bridge-injected buttons with the player's. Ocarina notes are read from button rows and, with a microphone, from voice (`oc_notes`, `oot_voice.c`, `nn_audio_in.c`). **[C]**
- Rendering: `gpu/vk/vk_replay.cpp` presents; bridge `shot` returns the game's own picture (HUD included, Insert-menu overlay and FPS counter not included) as PNG at 1280x720 or `RX_VK_SHOT_W x RX_VK_SHOT_H`. **[C]** `docs/control.md` `shot`.
- Host-side callbacks can observe game events safely only if they follow `oot_state_tap.c`'s discipline: read guest memory only on a game thread at a known point, range-check every read, copy to a bridge-owned buffer under a lock, never hold locks over socket I/O. **[C]**

## 8. The control bridge (the integration point)

See `COMMUNICATION_PROTOCOL.md` for the full contract. Summary **[C]**:

- Off unless `HOS_CONTROL` is set. A bare name on Windows becomes `\\.\pipe\<name>`. Linux: Unix socket mode 0600 with `SO_PEERCRED`. Never TCP.
- `HOS_CONTROL` may be set in `longshot_env.txt` beside the game: `env_line_allowed` accepts `HOS_*` names whose value contains no path separators or drive letter, so a bare pipe name qualifies (`host/hos_main.c` 502-535). `HOS_CONTROL_PEER_SID` is refused from the file; `HOS_CONTROL_MEM` is **not** refused, so a shared env file can enable memory access, which is why the companion must never write it.
- Newline-delimited JSON, protocol `1`, additive evolution ("clients ignore unknown fields").
- `status`, `subscribe events:["oot"]` with `every`, `flags`, `changes`; `saves`; `shot`; `option_get/set`; `press/stick/sequence`; `teleport`; `age`; `quit`; `relaunch`; `mem_read*` (opt-in).
- Up to 8 clients, 64 pending requests, 64 KB request lines, 8 MB output buffer per client before drop.
- Named read-only game values are available without `HOS_CONTROL_MEM`: Link's position, facing, camera yaw, event/loading, age, life, max life, rupees, A-button prompt, music, and **any GameDataMgr flag by name hash**. **[C]** `docs/control.md`.

### State sources inside the game that the tap reads **[C]**

`host/oot_state_tap.c` constants (build `e0f3ccfa`; **hard-coded guest addresses**):

| Constant | Value | Meaning |
|---|---|---|
| `STATE_GAMEDATA_SLOT` | `0x84c9e180` | holder of the `GameDataMgr` pointer |
| `STATE_EVENTMGR_SLOT` | `0x84c9e090` | event manager; `+104` non-zero means an event is playing |
| `STATE_CAMERAS_SLOT` | `0x84ca6bc0` | camera manager |
| `STATE_LINK_POS` | `0x31c` | offset of Link's position in his actor |

`GameDataMgr` typed containers (offset, entry stride, value offset): Bool `0x008/0x18/0x16`, Int `0x0c8/0x28/0x1c`, Float `0x188/0x28/0x1c`, Enum `0x248/0x38/0x1c`, String64 `0x608/0x108/0x68`, UInt `0x788/0x28/0x1c`. Each container: count at +8, entries pointer at +16, a `{u32 hash, u32 entryIndex}` open-addressed table pointer at +24, table size at +36. A separate `Bool64bitKey` container at `GameDataMgr+0xc58`: count u32 at +0, entries pointer at +8, 16-byte entries `{u64 id; ...; value at +12}`. Flags are named by MurmurHash3 x86-32 seed 0 of their name. **[C]**

Named flags the tap already knows: `Sequence_CurrentBanc` (map), `Sequence_IsLoadingBanc`, `Sequence_IsChildhood`, `Player_Rot_For_Map`, `PlayerStatus.Life`, `PlayerStatus.MaxLife`, `PlayerStatus.CurrentRupee`, plus two String64 flags (A-button prompt, music) whose names are not known. **[C]**

## 9. Safety and stability implications for a companion

1. Every address above is for one build. A new game build needs an upstream refresh of those constants. The bridge does not currently report the game build id (its `version` is Longshot's). Proposal in `COMMUNICATION_PROTOCOL.md` s.9. **[C]** constants, **[I]** consequence.
2. `Bool64bitKey` (Gold Skulltulas, most heart pieces, heart containers) is read internally by `hos_oot_gamedata_bool64` but not exposed on the bridge. PR #1655 states this explicitly. **[C]**
3. Change scanning visits at most 4096 hash slots per present across four tables; real table sizes and full-pass latency "have not been measured". The log line `control: oot changes scan:` reports them. **[C]**
4. Samples stop while Link is not updated (title, pause, loading), and `status.game` is not a whole-game atomic snapshot. **[C]**
5. The bridge grants **same-user** access with no per-client capability scoping: any process running as the user can send `press`, `quit` or write a PNG to any user-writable path. A "read-only companion" is a discipline of the client, not enforced by the server. **[C]** `docs/control.md` "What a client can do".
