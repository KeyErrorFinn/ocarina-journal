<!-- Thanks! One or two sentences on what this changes and why is plenty. -->

**Tested with:** <!-- Longshot version and game revision, bridge on or off, or "no game" -->

- [ ] I read the [project rules](https://github.com/KeyErrorFinn/ocarina-journal/blob/master/docs/RULES.md): nothing from the game or Nintendo is in this pull request
- [ ] `cargo fmt`, `cargo clippy` and `pnpm check` pass (see [CONTRIBUTING](https://github.com/KeyErrorFinn/ocarina-journal/blob/master/CONTRIBUTING.md#checking-your-change))
- [ ] One topic; no workflow changes mixed in

### If this changes what players see
- [ ] Screenshots attached, at a narrow (about 450 px) and a wide window; no game-derived art, text or personal details visible
- [ ] Works with no game running, no bridge and no saves (shows what is missing instead of breaking)
- [ ] A line under **Unreleased** in `CHANGELOG.md`

### If this reads game data or saves
- [ ] Still read-only: nothing writes to saves or game files
- [ ] New facts marked [V], [I] or [U] in `docs/research/`, with how each [V] was checked
- [ ] Ran the game tests with `OJ_TEST_GAME` (version: ) or said why not

### If this adds art
- [ ] Original; where it came from: <!-- drawn by me / generated with ... --> and no Nintendo images used as input
- [ ] No Triforce, crests, logos, game characters or text in the picture
