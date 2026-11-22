# Windows release dependency review (2026-11-22)

Target: `x86_64-pc-windows-msvc`. Exact versions are in Cargo.lock and app/pnpm-lock.yaml.

- `url` is updated to 2.5.9, the fixed version for RUSTSEC-2026-0592 (nested blob-URL stack overflow).
- The direct `chrono` dependency was replaced by maintained `jiff` 0.2.46. Calendar-day boundaries remain
  05:00 local time, with regression coverage for the 23-hour and 25-hour daylight-saving transition days.
- `paste` 1.0.15 has an **unmaintained** notice (RUSTSEC-2024-0436), not a reported runtime vulnerability in
  this scan. It is a build-time proc macro used by texture2ddecoder 0.1.2, whose latest published release still
  uses it. The release retains that locked, existing dependency rather than introducing an unreviewed decoder
  fork. It processes the dependency's macro definitions at build time; it is not a service receiving game data.
  Track upstream maintenance and reassess before later releases.
- `glib` 0.18.5 (RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g) and unmaintained `proc-macro-error` 1.0.4
  (RUSTSEC-2024-0370) occur on non-Windows dependency paths. `cargo tree --target x86_64-pc-windows-msvc`
  confirms they are absent from the Windows build. This is not an exemption for a future Linux release.

OSV package/version queries and `pnpm audit --prod` were used to identify advisories; they cannot prove that
all vulnerabilities are known. Third-party licence texts and source references are bundled with the app.
No blanket advisory suppression or automatic dependency updates were introduced.
