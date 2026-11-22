# Linux support

What the Linux build of Ocarina Journal assumes about Longshot, where each assumption comes from, and what is not
yet checked. Claims are marked **[V]** verified (against Longshot's own documentation or code, as read from a
local clone of the Longshot repository at commit `868f6be`), **[I]** inferred, **[U]** unknown.

## How the app finds the game and the saves

| Thing | Windows | Linux | Source |
|---|---|---|---|
| Game folder (default) | `%USERPROFILE%\Games\Longshot` (newest version folder inside) | `~/Games/Longshot` | **[V]** Longshot README, "where things are" table |
| Game binary | `bin\longshot.exe` | `bin/longshot` | **[V]** Longshot README ("the game itself is `bin/longshot`"); `docs/control.md` ("`launch` finds `bin/longshot.exe` on Windows or `bin/longshot` on Linux") |
| Saves and settings | `%APPDATA%\Longshot` (Longshot's README also names a `user` folder in the game folder) | `~/.local/share/longshot` | **[V]** Longshot README for the Linux path and for `--user <folder>`; **[I]** that `$XDG_DATA_HOME` moves it, as Longshot's own `scripts/longshot_ctl.py` computes the default |
| Save layout | `save/<user id>/slot_NN/progress.sav` | same | **[V]** the format is the same game code on both |
| Game process name | `longshot.exe` | `longshot` | **[V]** from the binary names above |

The app also accepts `OJ_GAME` (game folder), `OJ_SAVE_DIR` (one save user folder) and `OJ_REPORT` (a hand-made
report) on both platforms.

## The control bridge

- **[V]** The bridge is off unless `HOS_CONTROL` is set. On Linux its value is the **path of a Unix domain socket**
  (never TCP); on Windows a named pipe (`docs/control.md`, "Turning it on" and "Security").
- **[V]** The socket is created with mode 0600 and the game turns away a client whose `SO_PEERCRED` user differs
  from its own. The socket's folder must be owned by the game's user and writable by no one else (not a shared
  `/tmp`), otherwise the bridge stays off and the log says why. The path is a file system path, with no abstract
  names.
- **[V]** Longshot's own client, `scripts/longshot_ctl.py launch`, uses a private run folder (mode 0700) under
  `$XDG_RUNTIME_DIR`.
- **App behaviour:** the app's socket is `<data dir>/control.sock`, where the data dir is
  `$XDG_DATA_HOME/ocarina-journal` or `~/.local/share/ocarina-journal`, created with mode 0700 (and set to 0700
  if it already existed). **[I]** This satisfies the folder rule above; it has not been run against a live Linux
  game by this project.
- **Start game** (the Home screen's consented action) starts `bin/longshot` with `HOS_CONTROL=<that socket>` for
  that launch only, and passes `--user <Longshot's data folder>` so a directly started game uses the normal saves
  rather than making a new empty save folder. It refuses a socket path that is not absolute or
  does not fit a Unix socket address (under 108 bytes); `OJ_PIPE` overrides the path.
- **No persistent switch on Linux.** On Windows the app can add `HOS_CONTROL` to `longshot_env.txt` after a
  preview and a backup. **[U]** Whether Longshot reads an equivalent file on Linux is not established, so the
  Linux app does not offer to edit one; it offers Start game, or the player sets `HOS_CONTROL` themselves.
- The bridge client (`crates/oj-bridge`) opens a `UnixStream` on Linux. A test serves the fixture on a real
  Unix socket (`talks_to_a_real_unix_socket`) and runs on Linux in CI.

## What is not verified

- **[U]** A full run of the Linux app against a live Linux Longshot game. CI builds and starts the app in a virtual
  display with no game and with a synthetic report; the live bridge on Linux is covered by the fixture test only.
- **[U]** Wayland-specific behaviour of the web view. The CI smoke test uses X11 (`GDK_BACKEND=x11`).
- **[U]** Distribution coverage. The `.deb` and `.rpm` packages and the AppImage are built on Ubuntu; other
  distributions are expected to work through the AppImage but haven't been tested.

## Dependencies the Linux build needs

The app uses Tauri 2, which renders with WebKitGTK 4.1. To build from source:
`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`, `patchelf` and a C
compiler (Debian and Ubuntu names; see the [Tauri prerequisites](https://tauri.app/start/prerequisites/#linux)
for other distributions). The packages depend on the matching runtime libraries.

## Security note on the GTK dependency

Tauri's Linux backend pulls in the `glib` 0.18 crates, which carry the advisory RUSTSEC-2024-0429 (unsoundness in
`VariantStrIter` from `Variant::array_iter_str`). The app and its locked dependencies don't call that iterator;
`scripts/check-linux-glib.py` scans the locked Linux dependency graph for it and CI runs it, so a new use fails the
build. Upgrading follows Tauri's own move to a newer `gtk-rs`.
