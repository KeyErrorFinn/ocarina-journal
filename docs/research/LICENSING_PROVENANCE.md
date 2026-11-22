# Release provenance review (2026-11-22)

## Scope and decision

The release is GPL-3.0-or-later. The save-reader/catalogue rules are treated conservatively as adapted GPL
work, even though the implementation is Rust and the reference tools are Python. The release does not rely
on the previous assertion that an independent-language implementation removes attribution/licence obligations.
The full GPL text, upstream attribution, corresponding project source, dependency lockfiles and third-party
licence notices accompany the release. This records the engineering compliance basis, not a legal guarantee
about all possible uses of Nintendo's intellectual property.

## Evidence checked

- **[V]** The locally retained Longshot source at commit `868f6be871f9aa6c33c4d908f103d06e203e5007`
  contains the GPL-3.0 text in LICENSE. README's License section explicitly states GPL-3.0-or-later and credits
  the Longshot contributors. Checked directly in the retained Git checkout, not inferred from an absent file.
- **[V]** The saved PR #1655 patch contains the Python save-editor/reader and map work referenced by this
  project. The implementation was inspected against `crates/oj-gamedata/src/lib.rs` and `oj-savefile`:
  catalogue categories, naming/placement rules and save interpretation informed the Rust implementation;
  the upstream write/edit commands are not exposed by this app.
- **[V]** The investigation's preserved source inventory identifies PR #1401 as mooki's save editor, with
  observed head prefix `18e81a6c6f`; PR #1655 as TrashPanda's live map, with observed head prefix `6753f39165`.
  These are historical observations, not claims that a current hosting endpoint still serves those revisions.
- **[V]** The exact saved snapshots can be identified without distributing their contents or game data:

| Retained reference | SHA-256 |
|---|---|
| PR #1401 patch | `fafb836d433e031f9705be44eaf7e8f3e89e4e979b1d8dc25100223787694dbe` |
| PR #1655 patch | `97dae7a1a3e7e24f5e562e4252fc43b7c94c484e080fce1c8776646b67b23073` |
| PR #1655 scripts/longshot_save_editor.py | `40522b32a9c3ab1c6c1def5427bec69e5cc306d5360d3877a6dcddb55136763a` |
| PR #1655 scripts/oot_savefile.py | `7cd3eb7e5fcb77d10d5125e716e5f8f8b56841980bdf5d876f63e0b82e9f8743` |

The source inventory and patches are research records, not bundled game extracts. Their private storage
locations are deliberately omitted.

## Availability and limits

The legacy GitHub PR endpoints returned 404 during this review; the current MagicBean API returned 403.
The full PR-head commits are not present in the retained main checkout, so the patch checksums above are the
exact reproducible snapshot identifiers. No new author permission or endorsement was obtained or claimed.

The licence basis is the project's published GPL terms, the preserved source evidence, compatible GPL
distribution and attribution. GitHub's contribution terms also describe the default treatment of contributions
to licensed repositories, but they are not used as a substitute for the retained upstream licence evidence:
https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#6-contributions-under-repository-license

If contrary rights/licensing evidence is reported, pause distribution and investigate it. Do not silently
remove upstream notices or relicense the catalogue as permissive code. Runtime reading of a player's own
game does not grant permission to redistribute that game's files, artwork, sounds, names tables or saves.
