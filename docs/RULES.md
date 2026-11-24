# Project rules

These hold for every change, by anyone, and a pull request that breaks one can't be merged. They exist to keep
the project legal to share and safe to run on someone's own game and saves.

## Nothing from Nintendo or the game in the repository

- No game files or parts of them: no `romfs` contents, textures, maps, sounds, text, models, keys or saves.
- No Nintendo artwork, logos, screenshots or video frames, and nothing from the original *Zelda Notes* app
  (its art, icons, wording or code). Look at it to understand the idea; don't copy it.
- Game data (maps, sounds, names, text) is read **at runtime from the player's own install** and never written
  into the repository, the app bundle or test fixtures. Test fixtures are made by hand or synthesised.
- All artwork in `app/src/assets` and `assets/` is original. Say where new art came from in the pull request
  (drawn by you, generated and with which tool). Generated art must not use Nintendo images as input and must not
  contain the Triforce, crests, logos or the game's characters.

## The player's game and saves are read-only

- The app never writes to save files, never changes game files, and never bypasses DRM, authentication or other
  protection.
- The game bridge is read-only by default. Anything that could change the game's state needs the player's
  explicit consent, every time, and a maintainer's agreement before it is built.
- Changing a file the player owns (such as `longshot_env.txt`) needs a preview of the change, a backup and a
  confirmation.

## Private and local

- Nothing listens to other computers. Local interfaces bind to the local machine only.
- No telemetry, analytics or auto-updates. The one network call is the update check: a single plain HTTPS request
  to GitHub's public release API, sent only when the player presses "Check for updates" or leaves the start-up
  check on (it starts on; one switch in the menu turns it off). It sends no identifier and downloads and installs nothing.
- No personal details in shared files: no user names in paths, save folder ids, screenshots of your own saves
  or your machine's details. Blur them in screenshots.

## Honest about what is known

- Facts about the game, its files and the original app are marked **[V]** verified, **[I]** inferred or **[U]**
  unknown (see [CONTRIBUTING](../CONTRIBUTING.md#marking-claims)).
- Never invent an API, offset, flag or structure. Legal questions are documented, not decided
  ([`docs/research/RISKS_AND_LIMITATIONS.md`](research/RISKS_AND_LIMITATIONS.md)).

## Repository hygiene

- No editor or agent configuration that runs commands for whoever opens the repository (`.claude/`, `.codex/`,
  `.cursor/` hooks, `.vscode/tasks.json` that run on open, and the like).
- No prebuilt binaries in pull requests. Releases are built by CI from tagged source.
