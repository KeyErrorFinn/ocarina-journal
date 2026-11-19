# UI/UX specification

**Honesty note.** The brief asks for a UI inventory of every official Zelda Notes screen. Zelda Notes' screens are **remote web content** that is not in the APK (`ZELDA_NOTES_REVERSE_ENGINEERING.md` s.2), so no screen inventory could be produced from the app package. Section 1 lists the screens Nintendo's feature descriptions imply, as a checklist to fill from a screen recording of the live service on your own console save. Sections 2 onward specify our own design, which does not depend on it. No Nintendo art, text or layout is to be copied; the visual language is original.

## 1. Official UI inventory (skeleton to verify, not a finding)

| Area | What public sources imply | Confidence | To verify in the real app |
|---|---|---|---|
| Entry | Zelda Notes lives inside the Nintendo Switch App; pick the game | [S] | the home layout, game picker, onboarding |
| Map | interactive map | [S] one word | pan/zoom, layers, markers, search/filter, fog, live Link marker? |
| Gossip Quests | photo + hint button + points | [S] | list/grid, states, hint cost, completion animation |
| Hall of Fallen Foes | statues/rematches | [S] single | list vs diorama |
| Today's Record | chronological list with running totals | [S] | day navigation, icons, share |
| My Play Data / Global Play Data | stats pages | [N] for BOTW wording | charts, percentile display |
| Photo Studio | crop, frames, stamps, QR | [N] for BOTW | tool set |
| Play Ocarina | free play, guide, auto, write score, QR | [S] | touch layout, note feedback, accessibility |
| Quiz | 10-second timer, 4 choices, picture, streak, levels | [S] | result screens, daily limit UI |
| Settings, notifications, accessibility, animations | unknown | [U] | all of it |

## 2. Product principles

1. **A purpose-built game companion, not a web dashboard.** Dense, quiet, instantly legible while glancing at a second monitor.
2. **Live first.** The most important thing on every screen is the connection state and "what is happening now".
3. **Honest data.** Every number says where it came from (live, save, estimated by this app). Approximations are labelled, never disguised as official.
4. **Compact.** No oversized cards, no hero banners, no decorative gradients, no emoji-sprinkled marketing copy. Tight spacing scale (4/8/12), 13-14 px base text, tabular numerals.
5. **Restraint in motion.** Short (120-180 ms) transitions, only for state change (marker collected, panel open). Respect `prefers-reduced-motion`.
6. **Keyboard, mouse and controller are equals.**

## 3. Window and layout model

Resizable, min 420x320 (mini panel), comfortable 1100x700, scales to 4K via CSS px and `rem`; UI scale setting 80-150%.

Three layout densities selected by width:

| Width | Layout |
|---|---|
| < 560 px (mini) | single column, top status strip, bottom tab bar (Map, Goals, Record, More) |
| 560-960 px (compact) | left icon rail (48 px) + content; side panel becomes a slide-over |
| > 960 px (full) | icon rail + content + optional right inspector (260-320 px) |

Chrome: 28 px title/status bar with connection pill, slot chip, game clock (see below), window mode buttons (pin on top, mini). No large sidebar logos.

```
┌ ● Connected · Slot 03 · Kokiri Forest (child) · 59 fps ─────── [pin][mini][⚙] ┐
│ ▣ Map │ ┌─ map canvas ───────────────────────────┐ ┌ Inspector ─────────────┐ │
│ ☑ Goals│ │  layers  ▾   search…        100%: 41% │ │ Kokiri Forest          │ │
│ ⏱ Today│ │                                        │ │ Chests      3/7        │ │
│ ☠ Foes │ │        ● Link  · trail                 │ │ Skulltulas  1/3        │ │
│ 📷 Photo│ │                                        │ │ Heart piece 0/1        │ │
│ ♪ Ocarina                                          │ │ ───────────────        │ │
│ ? Quiz │ └────────────────────────────────────────┘ │ Missing (4) …          │ │
└────────────────────────────────────────────────────┴────────────────────────┘
```

(Icons illustrative; shipped icons are our own set.)

## 4. Screens

### 4.1 Connection and setup
- **Pill states** (always visible): `Not found`, `Waiting for Longshot`, `Starting` (with elapsed time), `Bridge off`, `Connected`, `Game paused/loading`, `Reconnecting`, `Incompatible`. Each pill has a one-line cause and a single primary action.
- **Setup wizard** (first run): 1) find game folder/saves (auto + browse), 2) explain what the control bridge is and that it is local-only, same-user, off unless enabled, 3) consent to add `HOS_CONTROL=<name>` to `longshot_env.txt` with a **diff preview and backup**, or choose "launch game from this app", or "save-watch only", 4) verify with a live test.
- **Diagnostics drawer**: protocol, Longshot version, scan slots/latency (from the game's log line), dropped samples, last error, "Copy redacted diagnostics".

### 4.2 Map
- Canvas with pan/zoom (wheel, drag, +/-, 0 resets), area switcher (dropdown plus search), minimap in mini mode.
- **Layers** toggle chips: Link, trail, chests, Gold Skulltulas, heart pieces, containers, dungeon items, labels. Filter: Missing / Collected / All. Search by name or area.
- Link marker: arrow with facing; camera cone optional; follows with "Follow Link" toggle, auto-pause on manual pan.
- Markers: 2 states (missing = filled, collected = outlined) plus unknown = hollow dashed; colour + shape redundant for colour-blindness.
- Background: schematic art we author, or the exploration trail only (MVP). Never Nintendo art.
- Inspector: per-area counts, missing list with "where" hints; click a row to centre the marker.
- Live latency indicator: "last update 0.1 s".

### 4.3 Goals (Collectibles and completion)
Table with category rows (`have/total`, thin progress bar), expandable to areas, then entries. "Missing only" toggle, per-area filter, sort by distance to Link when connected. Completion % labelled "this app's count, not the game's". Export CSV/JSON.

### 4.4 Quests (Threads of Time view)
List grouped Story / Side; row = name, step `3/5`, state icon; detail shows step text read from the player's own game files if available, else step number only. Label: "Progress mirror".

### 4.5 Today's Record
Day navigator (prev/next, calendar popover). Top: totals strip (time, enemies, rupees gained, hearts lost, game overs, distance; unavailable metrics show "n/a (no data source)" never 0). Below: chronological timeline, grouped by map visit, icons for event types, collapsible sessions. A footer states "Measured by this app while connected". Edge handling: sessions across midnight split by local date; gaps shown as hatched bars.

### 4.6 My Play Data / Community Data
Totals over all time since "recorded since <date>", per slot filter, small sparkline per metric (restrained chart style). Community Data tab appears **only** when the opt-in service exists and is enabled.

### 4.7 Hall of Fallen Foes
Dense grid (6-10 columns at full width) of tiles: glyph, name, count, new-kill pulse. Filter: Defeated / Not yet; sort by recent. Bosses section above.

### 4.8 Location Quests (local Gossip Quests alternative)
Card list limited to a compact row each: thumbnail (user's own screenshot, or generic glyph), hint text, status. Detail: "Hint" (reveals area), "Track" (shows direction arrow/distance on the map). Completion: toast + ledger entry. Labelled "Location Quests (local)"; not named Gossip Quests in UI.

### 4.9 Photo
Source picker (Take photo from game / Open file), crop (aspect presets), frame picker, stamp drawer, text, export PNG, copy to clipboard, QR of a share code. Our art only.

### 4.10 Ocarina
Six-button ocarina layout (original design), touch/mouse/keyboard (`A S D F G`-style configurable) and gamepad. Modes: Free, Guide (scrolling note bars), Auto-play, Score editor. Playback via our synthesis. Optional "Send to game" toggle is **hidden behind Settings > Advanced** and requires confirmation each launch (see protocol capability table).

### 4.11 Quiz
One question per screen: image area, four large answers (1-4 keys), 10-second ring timer, streak and level indicator. Pause is not allowed during a question. Daily free play badge; extra plays cost points (never Rupees).

### 4.12 Settings
General (language, theme, UI scale, start with Windows, minimise to tray), Connection (pipe name, auto-connect, sample rate, consent management), Data (paths, catalogue rebuild, export/import, delete history), Privacy (community stats off by default, what would be sent), Accessibility (reduced motion, high contrast, larger targets, colour-blind palette), Advanced (drive-input toggle, diagnostics).

## 5. Interaction rules

- **Keyboard:** `Ctrl+K` command palette (jump to area, toggle layer), `1-6` screens, `M` map, `/` search, `F` follow Link, `Esc` back/close, arrow keys pan, `+/-` zoom, `Ctrl+Shift+P` pin on top. All actions reachable without a mouse; visible focus rings.
- **Mouse:** wheel zoom to cursor, drag pan, middle-click reset, right-click marker for context actions, hover tooltips <= 200 ms delay.
- **Controller:** D-pad moves focus, A select, B back, bumpers switch screens, sticks pan the map, triggers zoom; active only while the window has focus.
- **Notifications:** toasts for new collectibles and quest completions, max 3 visible, auto-dismiss 4 s, "do not disturb while game in event/cutscene" using `event:true`.
- **Search/filter:** global debounced search across areas, items, enemies, quests.

## 6. Visual design

- Type: system UI stack plus one distinctive display face for headings only (self-hosted, open licence); tabular numbers.
- Colour: dark theme default, light theme, and OS-follow. Neutral surfaces (3 elevation steps), one accent colour (user-selectable, default a Hylian-green teal chosen independent of Nintendo branding), semantic colours for collected/missing/warn. WCAG AA contrast (4.5:1 text, 3:1 UI), checked per theme.
- Shape: 6 px radii, 1 px hairlines, no shadows beyond one popover shadow, no glassmorphism, no gradients except the map's functional heat/trail fade.
- Density: row height 28-32 px; cards only where content is a self-contained object (a quest, a photo).
- Motion: marker "collected" pop 140 ms, panel slide 160 ms, trail fade; all disabled under reduced motion.
- Iconography: own set drawn consistently (24 grid, 1.5 px stroke). **Not** Nintendo item icons. Where the user's own game files contain item icons, they may be rendered locally from those files at run time (never bundled), if and only if Phase 0 legal review allows; default is our generic glyphs.

## 7. Accessibility

Full keyboard operation; ARIA roles on the map's marker list (the map has a parallel list view so nothing is canvas-only); live-region announcements for toasts; colour is never the sole signal; text scales to 150% without clipping; reduced-motion and high-contrast modes; screen-reader labels for numbers ("3 of 7 chests"); touch targets >= 32 px in touch mode. Ocarina has an accessible alternative (keyboard and on-screen letters, note names read out).

## 8. Second-monitor and overlay mode

- **Second-monitor mode** (recommended): the main window sized to the other display, large-type map and a "Next goals" panel (nearest missing items). Remembers monitor and bounds.
- **Always-on-top mini panel**: opt-in, borderless, 320x200 default, opacity 70-100%, click-through toggle with a hotkey. Not an overlay on the game's swapchain. Documented limit: invisible over exclusive fullscreen **[I]**.
- Both reuse the same React components via layout tokens, not separate codebases.

## 9. States to design explicitly

Empty (no Longshot), loading, stale (> 5 s no sample), error, incompatible, offline-only features, first collectible, 100% celebration (restrained), "data source missing" for metrics without a source, corrupted/unsupported save.

## 10. Usability validation

Round 1: clickable prototype (Figma-less; Storybook) with 5 Longshot players on a second monitor while playing; task list: find the next missing skulltula, check today's enemies, take and export a photo, re-connect after game restart. Targets: 90% task completion, no task > 20 s. Round 2: after Phase 4. Track glance-time (eye off game < 2 s) as the key metric.


---

> **Update 2026-11-19:** the official screens are now documented in detail in `ZELDA_NOTES_UI_REFERENCE.md` (from Nintendo's own marketing screenshots and about 15 articles). Where this specification guessed at layouts, that document supersedes it. The home screen and all behaviour beyond one frame per feature are still unseen.
