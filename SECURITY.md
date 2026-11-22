# Security

Ocarina Journal runs on players' own PCs, reads their saves and game files, and talks to the running game over a
local pipe. A security bug here can reach someone's machine, so please report anything you find privately, not
in a public issue.

## How to report

Use GitHub's private vulnerability reporting: open the
[Security tab](https://github.com/KeyErrorFinn/ocarina-journal/security) and choose **Report a vulnerability**.
Only the maintainer sees the report.

Please include what is affected, the steps to reproduce it, the version (or commit) you used, and what an
attacker could do with it. You should hear back within a week.

## What counts

- The app reading or writing files outside what it needs (the game folder, the save folder, its own data folder),
  or being made to through a crafted save, game file, path or share code.
- Any way to make the app or its bridge connection reachable from another computer, or to send commands to the
  game that aren't read-only without the player's consent. On Linux that includes the control socket: the folder
  that holds it must stay private to the user (mode 0700), and the path must stay a local Unix socket.
- A Tauri command callable with arguments that escape its intended scope (for example `get_sound`, `get_map_image`
  or the bridge set-up commands).
- A crash or hang from a crafted input file (saves, BYML, SARC, BNTX, BWAV, QR or share codes).
- Anything that would make a release build run code it shouldn't.

## What doesn't

- Problems in Longshot itself: report those to the [Longshot project](https://github.com/Recomper/Longshot).
- A player choosing to edit their own files.

## Supported versions

Only the latest release and the `master` branch get fixes.
