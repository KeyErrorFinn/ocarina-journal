# Activate the contributor setup

The contributor files, CI, draft-release workflow and bot configuration are local until pushed. This page is a
maintainer checklist, not evidence that GitHub settings have been enabled. No installer has been published and
the licensing review below is still open.

## Activation recorded on 2026-11-22

Verified through fresh GitHub API reads: Issues and Discussions enabled; Q&A, Ideas and Show and tell
categories present; private vulnerability reporting enabled; contribution labels and topics present.
`master` requires the three named CI checks below, one approval, code-owner review and resolved conversations.
Force pushes and deletion are blocked. Admin bypass is retained for the sole maintainer. These check names are
configured ahead of the first workflow run; until the local workflows are pushed and run, contributor PRs
cannot satisfy them. CODEOWNERS takes effect after its file is published on the base branch.
Actions defaults were also verified as read-only, with workflow approval of pull requests disabled.

Starter issues: [clean Windows setup (#1)](https://github.com/KeyErrorFinn/ocarina-journal/issues/1),
[guide audit (#2)](https://github.com/KeyErrorFinn/ocarina-journal/issues/2),
[Hall time units (#3)](https://github.com/KeyErrorFinn/ocarina-journal/issues/3), and
[Tapestry states (#4)](https://github.com/KeyErrorFinn/ocarina-journal/issues/4).

Still pending: pushing these files (not requested), the first hosted CI run, installing the review app,
uploading a social preview, resolving the licensing gate, and tagging/building/publishing the first release.
Social-preview upload could not be completed because the browser access host was unavailable.
The README still needs a sanitized no-game/synthetic UI screenshot; no gameplay screenshot has been committed.

## Publish the foundation first

Push the reviewed commits to `master` when ready. On a new repository, let CI run before selecting required checks. The
three check names are **Rust (fmt, clippy, tests)**, **App (types, lint, format, build)** and **Repository rules**.
If any fail on GitHub's clean runners, fix that before making the check mandatory. Local passing checks do not
prove a fresh runner has passed.

## GitHub settings

Open [repository settings](https://github.com/KeyErrorFinn/ocarina-journal/settings). An owner/admin must apply
these; committing files does not activate them.

1. **General:** enable Issues and Discussions. In Discussions, create Q&A (question/answer format), Ideas and
   Show and tell categories. Match the category links in `.github/ISSUE_TEMPLATE/config.yml` to their actual slugs.
2. **Code security / Advanced Security:** enable private vulnerability reporting, then verify that the
   [private report form](https://github.com/KeyErrorFinn/ocarina-journal/security/advisories/new) is available.
   `SECURITY.md` depends on this being enabled.
3. **Branches or Rules / Rulesets:** protect `master`. Require pull requests, the three CI checks above, and
   resolution of conversations. Block force pushes and deletion. Enable code-owner review for contributor PRs.
   `CODEOWNERS` requests reviews; it only becomes mandatory when the branch rule requires it. A sole owner
   cannot approve their own PR, so keep an explicit maintainer bypass if necessary, rather than disabling CI.
4. **Actions / General:** use read-only default workflow permissions. The release job explicitly requests
   contents write for draft releases. Do not pass secrets to untrusted PR code or enable automatic approvals.
5. **About** on the repository home page: description suggestion:
   "Unofficial, local, read-only Windows companion for Longshot: maps, journals, progress and ocarina."
   Suggested topics: `tauri`, `rust`, `react`, `typescript`, `windows`, `companion-app`, `ocarina-of-time`.
6. **General / Social preview:** upload `assets/logo.png`. This is an original logo, not a screenshot.
7. Install the optional review bot using [PR-BOT.md](PR-BOT.md). Keep merge decisions with a person.

See GitHub's documentation for [branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
and [private reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).

## Labels and starter issues

Create these labels (keep existing labels and colours if they already exist):

| Label | Colour | Meaning |
|---|---|---|
| `good first issue` | `7057ff` | Small, bounded contribution with clear acceptance checks |
| `help wanted` | `008672` | A maintainer would welcome help |
| `bug` | `d73a4a` | Incorrect behaviour |
| `enhancement` | `a2eeef` | Agreed improvement |
| `research` | `5319e7` | Evidence about game data or behaviour |
| `needs-triage` | `fbca04` | Waiting for an initial maintainer assessment |
| `needs-repro` | `d876e3` | Needs reproducible steps or a synthetic case |
| `area:map` | `c5def5` | Maps and markers |
| `area:ocarina` | `c5def5` | Instrument, songs and scores |
| `area:bridge` | `c5def5` | Read-only live integration |
| `area:journal` | `c5def5` | Today, History and Journey |
| `area:docs` | `c5def5` | Documentation and contribution guides |

Use [STARTER-ISSUES.md](STARTER-ISSUES.md) for ready-to-post issue briefs; search for duplicates before posting.
Issue form labels only apply if those labels exist on GitHub.

## First release

1. Resolve the provenance/licensing gate below. Run the contributor checks, including real-install tests, and
   manually check narrow and wide windows, bridge on/off and offline operation. Record the game/Longshot versions.
2. Confirm `Cargo.toml` workspace version, `app/package.json` and `app/src-tauri/tauri.conf.json` agree. Move
   release notes from Unreleased into a dated version section in `CHANGELOG.md`.
3. Commit and push the reviewed release source. Create and push `v0.1.0` only when ready to make that release.
   This starts `release.yml`; it builds the Windows installers into a **draft** GitHub Release. The workflow
   rejects mismatched tag/package versions. Tags with a hyphen are marked prereleases.
4. Download the draft installer and check it on Windows. It is unsigned unless signing is separately configured;
   no signing certificate is supplied by this setup. Check that no game data or personal files are bundled.
5. Publish the draft after acceptance. The latest-release badge will have no release to display until then.

## Licensing gate

The repository declares GPL-3.0-or-later and now includes the full GPL text. That does **not** settle provenance
of the category rules implemented with reference to Longshot save-editor PR #1655 (older investigation notes
also cite PR #1401). `crates/oj-gamedata/src/lib.rs` describes an independent Rust implementation checked against
the tool's output; the exact boundary between copied expression and independently implemented behaviour needs
review. Do not claim upstream has granted permission or that the review is complete.

Before the first release, record in `docs/research/RISKS_AND_LIMITATIONS.md`: exact source revision/files,
the licence applying at that revision, whether any code/expression was copied, required copyright/notices,
and the maintainer's conclusion or permission evidence. If unresolved, keep the release on hold and say so.

## README preview

The README uses original logo art. A gameplay screenshot is deliberately not committed: the map, names,
tapestry and other game-derived content must stay outside the repository. A future app screenshot must show
only original UI with synthetic data or the no-game state, and must be checked for personal details.
