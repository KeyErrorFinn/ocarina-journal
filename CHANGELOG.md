# Changelog

Notable changes, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/). Add a line under **Unreleased** in any pull request
that changes what players see.

## Unreleased

## 0.1.0 - 2026-11-22

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
