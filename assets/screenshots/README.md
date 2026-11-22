# Screenshot provenance

Captured on 2026-11-22 from the 1.0.0 frontend, rendered by the local Vite development server in a browser.
Native desktop capture was unavailable. These are actual frontend captures, not generated UI mockups.

| File | Viewport | State |
|---|---|---|
| `home.png` | 450 × 960 | No game, no save report |
| `journey.png` | 450 × 1120 | Hand-made synthetic report and progress counters; generic Adventurer profile |
| `journal.png` | 450 × 1120 | Hand-made synthetic events and invented Demo Meadow location |
| `ocarina.png` | 450 × 860 | No game, no save report |

The capture session mocked Tauri IPC before mounting the unmodified app component. It supplied only invented
data and refused game-data, map and sound requests. No player's real saves, file paths, profile picture,
game-derived text or Nintendo images were loaded. Images visible inside the app are the project's own assets. The private capture harness is excluded from builds
and source exports. Do not describe synthetic screenshots as evidence of a live gameplay session.
