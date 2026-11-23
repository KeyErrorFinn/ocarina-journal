# Changelog

Notable changes, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/). Add a line under **Unreleased** in any pull request
that changes what players see.

## Unreleased

- **Lost Woods map.** The game's own picture of the Lost Woods is only foliage, so the app now draws the maze over it
  from the game's walkable volumes for the maze floor, read from your game files, with the four real exits labelled
  (Kokiri Forest, Sacred Forest Meadow, Goron City, Zora River). A setting can reveal the maze only as you explore it.
- **Exit arrows** are redrawn: a gold badge with a double chevron that points where the exit leads. Link's heading
  arrow and the "go to Link" arrow are redrawn too.
- **Display filters** show everything by default, and the filter button now says "Filters" with a funnel, a count of
  what is turned off, and a "Show everything" button in its sheet. Filters you saved before this version go back to
  showing everything once; your other map settings are kept.
- **Spoiler button** in an item's popup. It is hidden until asked for, then shows what your own game files say: what a
  chest holds, where the item sits relative to the nearest exit or Gossip Stone, and what the game calls it. Hand-written
  tips can be added in `app/src/data/tips.ts`.
- **Fixed:** a Gossip Stone stayed highlighted after you picked something else on the map.

## 1.1.1 - 2026-11-23

Fixes the game maps not showing in the installed app, and follows Longshot's new folder layout. Installing over
1.1.0 keeps your data.

- Fixes the game maps and pictures not showing in the installed app: its security policy blocked the in-memory
  pictures the app makes from your game files (`img-src` lacked `blob:`). Development builds don't apply that
  policy, which is why it went unnoticed.
- Finds the game when Longshot keeps builds inside a release-channel folder (for example
  `Games\Longshot\stable\v3.1.1`), not only directly under `Games\Longshot`.
- Reads saves from `save-work` when that folder changed more recently than `save`. Newer Longshot builds were seen
  writing there; this was observed on one install and is not in Longshot's documentation.
- Checks that can't be skipped: CI now starts the Windows release build and loads its page under the app's real
  security policy, and a repository check compares the policy with what the frontend uses. The release workflow
  runs both before a release can be published.
- The README shows total release downloads and a contributors list.

## 1.1.0 - 2026-11-22

Adds the Linux build and updates every dependency.

### Added
- Linux build (x86_64): `.deb`, `.rpm` and AppImage packages, built by the release workflow on Ubuntu 22.04. The
  app finds the game in `~/Games/Longshot` and saves in `~/.local/share/longshot`, and follows the game over a
  same-user Unix socket. Documented in `docs/research/LINUX.md`.
- Continuous integration for Linux: clippy, tests (including the bridge client against a real Unix socket), a scan
  for the unused glib iterator behind RUSTSEC-2024-0429, a release build, and a start-up smoke test in a virtual
  display with no game and with a synthetic report.
- Screenshots in the README, made from the frontend with no game data and invented demonstration data.

### Changed
- On Linux the Home screen offers **Start game** only: Longshot's persistent environment file is a Windows
  mechanism the app edits there, and nothing equivalent is established for Linux.
- The app's data folder, saves and game folder are resolved per platform (`app/src-tauri/src/platform.rs`).
- The launch and About texts no longer name `longshot.exe`.
- Dependencies updated: qrcode-generator 2 (the share-code QR images are unchanged), Vite 8, TypeScript 6, zstd 0.14,
  sysinfo 0.40 (a failure to list processes now counts as "game not detected" instead of a crash) and jiff 1.0.


## 1.0.0 - 2026-11-22

First public release; includes all features and fixes from the 0.1.0 release candidate below.

### Changed
- Windows installers now update the existing installation in place, including 0.1.0 installs. They reuse its
  folder and installed-app entry, preserve local data and shortcuts, and never run its uninstaller.
- Reinstalling the same version repairs the existing copy. Installing an older version over a newer one is blocked.

## 0.1.0 - 2026-11-22 (release candidate)

### Added
- Map of Hyrule and every area from the player's own game files, with chests, Gold Skulltulas and hearts, what
  is found, a hover card per place, and Link's position live with the bridge on.
- Rumor Hunt: 96 landmarks from the game's maps (gossip stones, grottos, cows, owls, scarecrows, frogs, a
  beehive), with points and rewards.
- Hall of Foes, My Journey medals, Slot Compare, Today's Journal and History (from the live bridge and from each
  save the game writes), Tapestry, Quiz.
- Ocarina: the game's own note sounds and song recordings, the remake's buttons in a controller layout, flat and
  sharp, recording, and scores shared as QR cards.
- Turning the bridge on from the app, with a preview and a backup of `longshot_env.txt`.
- App logo and icon.
- Contributor guide, project rules, issue and pull request templates, pinned CI and draft Windows release
  workflows, six contribution guides, Dependabot and code owners.

### Changed
- The window can be any size; pages keep a readable column on wide windows.

### Fixed
- Production builds exclude local browser-review data; the app icon is bundled explicitly.
- Replay fixtures use synthetic samples instead of recorded gameplay, and research notes omit machine details.
- Updated the URL parser dependency to fix a stack-overflow advisory involving nested blob URLs.
- Replaced the unmaintained date/time dependency, preserving local journal-day boundaries across daylight saving.
- Bundled third-party licence notices and documented the GPL provenance of the save catalogue rules.

### Not available
- Photo Album and amiibo (the PC version has no photo capture and no NFC reader).
