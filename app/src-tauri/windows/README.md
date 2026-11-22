# Windows installer template

`installer.nsi` is adapted from Tauri CLI **2.12.6**, commit
`9319e539f34237035cb4693bed9246660bc0a926`,
[upstream source](https://github.com/tauri-apps/tauri/blob/9319e539f34237035cb4693bed9246660bc0a926/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi).
It is used under the accompanying MIT licence. The unmodified template's SHA-256 is
`d00089d3b1a2c4a30d7b6e098079100cb8f25e980f84d4515aca4597b95e967d`.

Local changes are marked `OJ`. When the current-user NSIS registry entries identify an existing installation,
initialization reuses that directory and enables Tauri's update mode. This skips the uninstall-choice and
directory pages, leaves shortcuts and app data in place, and overwrites the application and bundled resources.
The same installed-app registry key is updated. `allowDowngrades: false` also applies to interactive updates.
Fresh installs retain Tauri's normal directory selection and prerequisite handling.

Keep the product name, publisher, application identifier and current-user install mode stable across releases.
The version belongs in package metadata, not the installation directory or product name. No MSI has shipped;
the inherited WiX migration path is not part of the supported upgrade contract.

On a Tauri CLI update, compare the new upstream template, reapply the marked changes, and repeat the installer
upgrade test before releasing. Do not copy a rendered script from `target/`: it contains machine paths.

Verify a fresh installation, 0.1.0-to-current upgrade, same-version repair and downgrade rejection in a disposable
Windows account or with a test-only product identity. Put a sentinel in the installation and in local app data,
and replace the old test uninstaller with a failing sentinel program: an upgrade must never invoke it. Also
check that a conflicting `/D` cannot create a second installation, that Installed apps has one entry at the new
version, and that the installed executable matches the release. Test silent and passive modes; inspect the
interactive flow separately. Never use a player's real installation or saves as test fixtures.
