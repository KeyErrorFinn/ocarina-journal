<img src="assets/icon.svg" width="64" height="64" alt="">

# Ocarina Journal (working title)

An unofficial, read-only Windows companion for the Longshot native PC recompilation of
*The Legend of Zelda: Ocarina of Time*. It reads game state over Longshot's local control bridge
(a same-user Windows named pipe, never TCP) and keeps a local play journal.

**Not affiliated with, endorsed by, or connected to Nintendo.** It ships no game files, keys,
Nintendo assets or Nintendo source. See `docs/research/` for the investigation and architecture.

Status: Phase 1 proof of concept. The bridge client never sends write commands: the `Command`
type in `oj-protocol` only defines read-only requests.

Created in [T3 Code](https://t3.codes).
