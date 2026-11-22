# Starter issue briefs

These briefs were published as issues [#1](https://github.com/KeyErrorFinn/ocarina-journal/issues/1),
[#2](https://github.com/KeyErrorFinn/ocarina-journal/issues/2),
[#3](https://github.com/KeyErrorFinn/ocarina-journal/issues/3) and
[#4](https://github.com/KeyErrorFinn/ocarina-journal/issues/4) on 2026-11-22. Search open and closed issues before
posting another copy. The research tasks need a real
install; do not label them good first issues or ask people to upload game files, saves or proprietary images.

## Documentation: verify a clean Windows contributor setup

Labels: `good first issue`, `help wanted`, `area:docs`

Follow CONTRIBUTING.md on a Windows machine without a game installed. Record any missing prerequisite or
ambiguous step, then send a small documentation fix. Acceptance: `pnpm check`, `pnpm build` and the Rust checks
can be followed from the guide; real-game tests are explicitly described as skipped. Redact personal paths.

## Documentation: check workflow guides against current code

Labels: `good first issue`, `help wanted`, `area:docs`

Choose one page in docs/workflows, follow its symbol/file references and improve one unclear instruction.
Acceptance: all named symbols exist, examples have the right shape, and commands use PowerShell syntax.
No new app feature or game data is needed.

## Research: verify Hall rematch time units

Labels: `research`, `help wanted`

The saved best time is currently interpreted at 60 frames per second. With your own install, compare a recorded
rematch time in the game against its saved numeric value. Record Longshot version, game revision, measurement
method and conclusion as [V]/[I]/[U]. Acceptance: evidence confirms or refutes the conversion without publishing
game files, screenshots, save data or personal details; update the relevant research note.

## Research: verify Tapestry silhouette states

Labels: `research`, `help wanted`

Check when a section changes between empty, silhouette and woven, including the final band, using your own
progression. Acceptance: record observed transitions and versions in docs/research/GAME_MAPS.md with confidence
marks. Describe observations in your own words; do not attach Nintendo artwork, extracted textures or saves.
