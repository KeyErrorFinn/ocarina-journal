# Third-party notices and source

Ocarina Journal is distributed under **GPL-3.0-or-later**, with the full licence in [LICENSE](LICENSE).
The release includes the corresponding project source and lockfiles. Build instructions are in README.md;
exact dependency sources are available through the locked Cargo and pnpm versions and the URLs in the bundled
`resources/THIRD_PARTY_LICENSES.txt` file. No game files, saves, Nintendo artwork or Nintendo source are supplied.

## Longshot save-editor reference and adapted rules

The save catalogue and reader were developed with reference to Longshot's save-editor work, including
**mooki's save-editor contribution (PR #1401)** and **TrashPanda's live-map contribution (PR #1655)**, which
incorporated the save-editor scripts. Credit belongs to those authors and the Longshot contributors.

Longshot states GPL-3.0-or-later in its README and supplies the full GPL-3.0 licence. Ocarina Journal takes the
conservative approach of treating its rule implementation as adapted GPL work, rather than relying on a claim
that translating the logic into Rust removes upstream obligations. It is distributed under the same compatible
licence with this attribution and complete project source. No upstream save-writing functionality is included.

Copyright (C) 2026 the Longshot contributors, for the referenced upstream work. The project is independent of
Longshot; this attribution does not imply endorsement. See the evidence and snapshot checksums in
[the provenance review](docs/research/LICENSING_PROVENANCE.md).

## Dependencies and fonts

Rust crates, frontend libraries and the Cinzel/Nunito Sans fonts retain their own licences. The bundled
third-party licence file includes their notices and source locations, including MIT, Apache-2.0, BSD, MPL-2.0,
Unicode and SIL Open Font License texts as applicable. Build-time dependencies are included in the notice set.
Third-party notices do not change the licences of those components.
