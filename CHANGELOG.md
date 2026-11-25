# Changelog

Notable changes, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/). Add a line under **Unreleased** in any pull request
that changes what players see.

## Unreleased

## 1.3.1 - 2026-11-25

- Tile notification dots now share their acknowledged state between the desktop and paired browsers. Opening a
  tile on either clears its notification on the other screens. Rumor Hunt discoveries, visited landmarks, explored
  Lost Woods rooms, quiz best scores and reward unlocks also sync through app-owned progress on the PC. Existing
  local progress is imported; map filters, window options and other display preferences stay per device. Game
  files and saves remain read-only.
- Scanning the second-screen QR code in an already paired browser now checks the existing session before
  starting pairing again. The pairing script remains available when a scanner omits the session cookie on
  its initial navigation but the browser includes it on subsequent requests. Cookie protection is unchanged.
- New browsers still receive the scanned pairing code automatically, then ask for the separate 4-digit code.
  Disconnected and expired sessions must still pair again.

## 1.3.0 - 2026-11-25

- Selected map pictures take priority over queued preloads. New background downloads pause until the selected
  picture finishes decoding, then resume; an existing download for the same picture is reused.

- Opening Map fetches every area's encoded pictures, eras and dungeon floors in the background, without
  blocking the world map. Reopening Map retries failed downloads, and the game-picture preference is respected.
- Location, era and floor changes keep the current view visible until the chosen destination has decoded,
  then switch directly to it. The decoded cache retains eight pictures plus active views, avoiding the large
  memory cost and initial delay of decoding the entire catalogue on a phone.
- A second screen detects an unreachable app even if its WebSocket stays open. Reachability checks and reconnect
  attempts time out, returning to the page checks again, and stale responses cannot dismiss the disconnect screen.

- **Settings page.** The three dots are now a settings cog that opens a full Settings page instead of a sheet: Status
  (connection, game and app versions, the game and save folders), Save folder, Updates, Window and About, each in its
  own card, with switches in place of the old checkbox. A "Second screen" card is laid out for showing the journal
  read-only on another screen.
- **Second screen.** Show your journal, maps, tapestry, ocarina and saves progress on a phone, tablet or second monitor,
  read-only. It is off until you turn it on in Settings, then starts again with the app. The parts:
  - **This PC or your network.** By default only this PC can reach it. "Allow other devices on my network" opens it to
    your home network, on this PC's private address only (never every address).
  - **QR code pairing.** On the network setting the app shows a QR code. Scanning it opens the page with the pairing
    code filled in, so only the 4-digit code is left to type. By hand, the page asks for the pairing code, then the
    4-digit code.
  - **A 4-digit code that refreshes every minute.** It is hidden in the app until you press Show, has a countdown, and is
    always typed on the other device, never put in an address.
  - **Rate limiting.** Pairing tries are limited to 6 a minute with a countdown on the page, and 20 wrong tries in a row
    replace the codes.
  - **Nothing before pairing.** A device that hasn't paired is sent only a small pairing page: no part of the app, no
    pictures, no data, and no flash of the app first.
  - **Connected screens.** Settings lists every paired device by name (such as "iPhone · Safari") and address, with a
    Disconnect button on each, and "New code" signs them all out.
  - **Stays paired.** Devices stay paired, also after restarting the app, until you disconnect them, make a new code, or
    one stays away for 7 days (using the page, or having it open, starts the 7 days over).
  - **Disconnect from the phone.** The page's own Settings has "Disconnect this device".
  - **Add to home screen.** That Settings page also has "Add to home screen" (an install button where the browser offers
    one, written steps otherwise).
  - **Loads fast.** Maps, tapestry (and its pictures), lore and rumors are loaded as soon as the page opens, so they
    aren't blank when you open them.
  - **If the app closes.** The page says it can't reach the app and reconnects by itself when the app is back.
  - **Window name.** While the second screen is on, the window's name shows how many devices have the page open.
  - **Read-only and private.** The page can't start the game or change anything, and never receives your folder paths.
  Details: `docs/research/SECOND_SCREEN.md`.

## 1.2.0 - 2026-11-24

- **Update check.** The menu has a "Check for updates" button that asks GitHub for the newest release and, if there is
  one, offers to open its page. The menu also shows which version you have. The app also checks once when it starts (a switch in the same panel turns that off) and, if a newer version exists, asks whether you want it: "yes" opens the release page, and nothing is downloaded or installed for you. This is the
  app's only network call: one plain HTTPS request, no identifier, nothing downloaded or installed for you.
- **Choose your save folder.** If the app picks the wrong saves (or none), the menu now has a "Save folder" box with a Browse button: pick or paste
  the folder that holds your `slot_00`, `slot_01`, ... folders, or the one above it. The choice is remembered and the
  app only reads it. The automatic search also looks for the saves Longshot's launcher keeps a few folders above the
  game build (`LongshotLauncher-data/user`), and uses whichever saves changed most recently.
- **Lost Woods map.** The game's own picture of the Lost Woods is only foliage, so the app now draws the maze over it
  from the game's walkable volumes for the maze floor, read from your game files, with the four real exits labelled
  (Kokiri Forest, Sacred Forest Meadow, Goron City, Zora River). A setting can reveal the maze only as you explore it.
- **Exit arrows** are redrawn: a gold badge with a double chevron that points where the exit leads. Link's heading
  arrow and the "go to Link" arrow are redrawn too.
- **Display filters** all start switched off, for a clean map, and the app keeps what you switch on. The filter button
  now says "Filters" with a funnel and a count of what is on, and its sheet has "Turn all on" and "Turn all off".
  Filters saved before this version are reset to off once; your other map settings are kept. It also no longer
  overlaps the "go to Link" button.
- **Spoiler button** in an item's popup. It is hidden until asked for, then shows what your own game files say: what a
  chest holds, where the item sits relative to the nearest exit or Gossip Stone, and what the game calls it. Hand-written
  tips can be added in `app/src/data/tips.ts`.
- **Visited landmarks.** Gossip Stones, grottos and the other Rumor Hunt landmarks are marked on the map once Link has
  stood right beside one while the app was connected. The save has no flag for speaking to a stone or entering a
  grotto (each stone's own flag stays unset even after using the Mask of Truth), so "visited" only means you were
  there. It is kept apart from the Rumor Hunt points.
- **Heart pieces given by an event** (for example from a Business Scrub) now show on the map. Their position was thrown
  away before, so they were listed but could not be found; this fixes the third Death Mountain Crater piece.
- **Link's hearts** are shown in at most two rows of ten; the second row only holds hearts once the first has ten.
- **The map title's underline** is redrawn.
- **Fixed:** a Gossip Stone stayed highlighted after you picked something else on the map.
- **Ocarina:** the note buttons sit closer together, so moving from one to the next is a shorter reach.
- **Song of Time and Prelude of Light** follow the rhythm of the game's full songs. Both were set from the
  accompaniment's half-beat. Re-measured against the recordings: Song of Time keeps its note lengths (1, 2, 1, 1, 2, 1)
  at a beat of about 520 ms (it played twice as fast), and the Prelude of Light's note lengths are 1, 3, 1, 1, 1, 3
  at 250 ms (they were 1, 1, 2, 1, 1, 3). How long the Prelude's last note is held can't be read through its
  accompaniment, so that one is an inference.
- **Shrinks to fit.** The whole app now scales down with the window, to about 160 px wide, and stays complete and
  usable instead of getting cut off.
- **Window options** (in the Home menu's "Window" section): keep the window on top of other windows, a see-through mode
  with a slider for how solid it is, and hiding the title bar (a slim bar with the same controls and a handle to drag the
  window by takes its place). They are remembered between runs. Pinning uses the window's own "always on top" and does
  nothing to other programs. See-through relies on the system's window transparency, so on a setup without it the
  window just looks dimmer.

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
