# Publishing a release

Patch release descriptions include every changelog back through the latest minor release, including that minor
release itself. For example, 1.3.2 includes 1.3.2, 1.3.1 and 1.3.0; 1.4.0 starts a new series. Keep each version
under its own heading so readers can tell what changed in the patch.

Generate these sections from the repository root with `python scripts/release-notes.py 1.3.1`, replacing the
version as needed. Paste the complete output into the GitHub release description alongside download and validation
details. Do not replace the earlier sections with only a link to CHANGELOG.md.

Before tagging, match the workspace Cargo version, app/package.json and app/src-tauri/tauri.conf.json, refresh
Cargo.lock, and run the repository checks. Build release packages from that immutable tag using the existing
release workflow. Before publishing its draft, verify hosted checks, download and inspect the package contents,
verify their digests, and attach the matching source archive and SHA256SUMS.txt. Keep private review prompts,
local development data, game files, saves and personal paths out of the source and packages. State validation
limits accurately; local Windows checks do not establish Linux or physical-phone behaviour.
