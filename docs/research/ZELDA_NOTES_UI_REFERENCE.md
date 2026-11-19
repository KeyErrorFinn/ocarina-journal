# Zelda Notes (Ocarina of Time): UI and behaviour reference

> **Update 2026-11-19:** a full walkthrough video closed several gaps below (the Home screen, Hall detail and ranking filters, Today's Record data list and the 05:00 day boundary, quiz timer, Play Ocarina screens). See `ZELDA_NOTES_VIDEO_ANALYSIS.md`; where the two differ, the video analysis is newer.

Revision 1, 2026-11-19. Companion to `ZELDA_NOTES_REVERSE_ENGINEERING.md` and `UI_UX_SPECIFICATION.md`.

This document records what the official Zelda Notes experience for *Ocarina of Time* (Switch 2) looks like and how it behaves, as far as public evidence shows. It is a **research reference for designing an original, unofficial companion**. It is not a spec to copy. See "What we may and may not reuse" (section 11).

## 0. Evidence and confidence

### How this was gathered

| Source type | What was done |
|---|---|
| Nintendo UK product page | Read the full text. Pulled the page HTML and listed the image assets it references. |
| Nintendo's own phone screenshots | Downloaded the **12 official phone screenshots** (one per feature; Today's Record has two) and **9 in-game companion screenshots** into a scratch folder **outside the repo**, and looked at each one. Nothing from them is committed. |
| Nintendo AU page, Nintendo US support pages | Read for requirements and troubleshooting. |
| Third-party text | Read about 15 articles and guides (list in section 12). |
| Videos | Searched, but **could not read any video**. The fetch tool returned only YouTube page chrome for the two guide videos found. No video frames, transcripts or recordings were analysed. |

### Tags used below

- **[S]** seen directly in a Nintendo screenshot.
- **[T]** stated in Nintendo's or a third party's text.
- **[I]** my inference. Not confirmed.

### Limits you should know about

1. The screenshots are **Nintendo marketing images, one frame per feature**. They show sample data (the player name "Evan", the date November 5, 2026, rupee count 120). Animations, transitions, empty states, error states, scrolling behaviour and anything below the fold are **not** visible.
2. **The home screen was not seen.** Nintendo publishes 11 tile icons (`CI_ZeldaNotes_homeicon01`-`11`, in feature order), but no screenshot of the home screen itself surfaced. Its layout below is [I].
3. The Hall of Fallen Foes screenshot shows only one boss (Gohma). The list view that precedes it was not seen.
4. Some third-party details conflict. Conflicts are noted where they matter.
5. No Zelda Notes **web content** was captured. The APK work showed these screens are server-delivered web pages, so the real implementation (fonts, CSS, animations) is not available to us and should not be.

The single best way to close these gaps is **screen recordings from your own Switch 2 and phone** (section 13).

## 1. What Zelda Notes is

- A section inside the free **Nintendo Switch App** (iOS 16+, Android 9+) [T]. It is not a separate app.
- Needs the same Nintendo Account on the console and the phone, the game updated to **1.1.1 or later**, and **an internet connection on both devices** [T]. Nintendo Switch Online is not required [T].
- Entry: open the app, choose **ZELDA NOTES**, choose **Ocarina of Time**, follow the connection prompts [T].
- The game must be online while you play for most features to work [T].
- It is optional. The game can be finished without it [T].
- Does not work with the N64 version on Nintendo Switch Online [T].
- Eleven features for *Ocarina of Time* (Breath of the Wild and Tears of the Kingdom have a different set of nine) [T].

## 2. Visual language [S]

All of this is read from the screenshots. Values are described, not sampled.

### Overall mood

A warm "adventurer's journal" look: **dark, textured, brown-black backgrounds** for the data screens, **parchment and orange** for the map and the Gossip Quest screens, with hand-drawn ornaments.

### Recurring chrome

| Element | Where | Notes |
|---|---|---|
| **Header band** | Today's Record, My Play Data, Global Play Data, Threads of Time+ | A wood-grain/bark panel at the top with a **torn, scalloped lower edge** and a curly ornament at the right. Small subtitle "The Legend of Zelda: Ocarina of Time" above a large bold title. |
| **Help button** | Right after the title on Today's Record, My Play Data, Global Play Data, Threads of Time+ | A circled "?". |
| **Top-left control** | All | One of three: a **house** (home), a **back arrow**, or a **close X**. Varies by screen. |
| **Top-right controls** | Varies | A **refresh** arrow (Hall of Fallen Foes, Today's Record, Threads of Time+, amiibo), a **gear** (Map, Global Play Data, Threads of Time+), or a **connection indicator** (Map, Gossip Quests). |
| **Connection indicator** | Map, Gossip Quests | A small teal icon of a console with two arrows. Teal means linked [I]. Shown only where live game data matters. |
| **Section dividers** | Hall of Fallen Foes, amiibo, Global Play Data | A thin line with a small curly flourish at each end. |
| **Tabs** | Today's Record (Timeline / Data), Hall of Fallen Foes (Records / Rankings), Photo Studio (Frames / Title Logos / Icons / QR Codes) | Flat segmented bars. The selected tab is filled with a tan/wood colour. Today's Record's tabs carry small ornaments either side of the label. |
| **Cards** | Today's Record data, Global Play Data, My Play Data tiles, Hall of Fallen Foes tiers | Dark panels with a thin bevelled/chamfered border. |
| **Primary button** | Gossip Quests ("Found!"), Photo Studio ("Complete") | Pill or chamfered rectangle with a glowing light outline; a camera icon on "Found!". |
| **Numbers** | Everywhere | Key numbers use a **decorative serif display face** in gold or white (for example "+30P", "01:06.26", "+50 minutes"). Body text uses a clean bold sans-serif. |
| **Value colour** | Highlights | **Gold/yellow** for important values and rewards, **teal** for connected, **orange-red** for the quiz timer. |

### Imagery

- Maps are **hand-illustrated per area**, in a parchment style with brown outlines and orange roofs. The in-game minimap in the official in-game screenshot uses the same art style, so the two share assets [S].
- Boss and monster images are in-game renders on dark backdrops.
- Medals are **shield or ribbon-style badges** in bronze, silver, and gold-ish tones, with a glyph in the middle (hourglass, footprints, a gem, a crown, and so on) [S].
- Locked content appears as a **dark silhouette** with the label "???" [S].

## 3. Information architecture

```
Nintendo Switch App
└─ ZELDA NOTES
   └─ Choose game: Ocarina of Time
      └─ HOME  (11 tiles, in this order [T])             <- layout not seen [I]
         01 Map                  -> Map (per-area)  -> filter / recenter / area completion
         02 Gossip Quests        -> quest card  -> "Found!"
         03 Hall of Fallen Foes  -> boss list -> boss detail: Records | Rankings
         04 Today's Record       -> Timeline | Data
         05 My Play Data         -> profile, medals, rupees banked
         06 Global Play Data     -> Combat, Deaths ... (scroll of comparison cards)
         07 Photo Studio         -> Edit Image: Frames | Title Logos | Icons | QR Codes
         08 Threads of Time+     -> tapestry -> scene -> cutscene replay
         09 amiibo               -> figure detail, scan counter
         10 Play Ocarina         -> score editor / Free | Guided | Demo
         11 Ocarina of Time Quiz -> question screen, two levels
```

### Evidence for this structure

- The **house icon** top-left on Today's Record, My Play Data, Global Play Data and Threads of Time+ [S] implies a home hub they return to.
- The **back arrow** on Map, Hall of Fallen Foes and amiibo [S] suggests those are one level deeper (a list or area picker first) [I].
- The **X** on Gossip Quests and Photo Studio [S] marks modal or editing flows.
- Nintendo's ordering of the 11 features (Map first, Quiz last) matches the icon numbering [T].

### How the pages relate

| From | To | Evidence |
|---|---|---|
| Gossip Quests (points) | Play Ocarina (buy sheet music) | [T] "points ... exchange for ocarina sheet music". Link's own scores come from story progress; extra scores cost **300 points each** (nine of them) [T, third party]. |
| Rupees (sent from in-game shops) | Quiz retries (20 rupees each) and Gossip Quest hints | [T]. "Rupees Banked 120" is shown on My Play Data [S]. |
| Play Ocarina | Photo Studio | [T] a Play Ocarina QR code can be attached to a photo. The Photo Studio has a **QR Codes** tab [S]. |
| Today's Record (timeline screenshots) | Photo Studio | [T] automatic screenshots are sent to the app and can be decorated. The exact tap path is [I]. |
| Threads of Time+ | Cutscene replay | [T] touching a section replays its cutscenes; a cutscene must have been seen in game first (per Zelda Wiki, via a third party). |
| Hall of Fallen Foes | My Play Data (medals) | [I] medal tiers (Bronze..Master) look like the same badge system; link not confirmed. |
| Map | Area completion | The expandable "Area Completion 14%" pill [S]. |
| amiibo | in-game item | [T] one item per figure per day; five scans of the same figure unlock one extra scan that day. |

## 4. Screen-by-screen

### 4.1 Map [S]

- **Header:** back arrow (left); connection indicator and gear (right).
- **Title:** the area name ("Kakariko Village") in bold at the left, with a long ornamental underline ending in a curl.
- **Floating controls (right):** two circular dark buttons. One has a **location arrow** (recenter on Link). The other has a **filter** icon (layers/filters, and the "hide unvisited" toggle described by Nintendo [T]).
- **Map:** a **full-bleed parchment illustration of the whole area**, with hand-drawn buildings, paths, a stream and trees. It fills the screen and appears pan/zoom capable [I].
- **Markers:**
  - **Skull icons** are Gold Skulltula locations. Some carry a small **check mark** meaning collected [S].
  - A small **chest icon** appears near the top [S].
  - A **red arrow** is Link's position and heading [S].
- **Bottom:** a rounded dark **"Area Completion 14%"** pill with an up-chevron. It expands (likely a list of collectibles for the area) [I].
- **Data behind it [T]:** Pieces of Heart, treasure chests, Gold Skulltulas, including inside dungeons; completion per area; unvisited places can be hidden to avoid spoilers.
- **Live:** real-time position [T]. In the sibling Breath of the Wild app, Nintendo says position updates "every few seconds" [T].

### 4.2 Gossip Quests [S]

- **Card layout:** a full-screen orange gradient.
  - Top bar: X (left), connection indicator (right).
  - "**Rumor 057**" (white, bold), then the reward "**+30P**" in a large gold display face.
  - A **soft-edged screenshot** of the target place (the example shows a giant three-faced Goron statue).
  - A one-line rumor: "It is said that there is a giant Goron with three faces..."
  - A large pill button, **"Found!"** with a camera icon.
- **Behaviour [T]:** 100 quests; each pays 30 or 40 points; you find the place in game and tap "Found!" while there; the app signals when you are nearby; points buy sheet music; rupees buy a hint of the general area.
- **Not seen:** the quest list/index, the hint screen, the points balance, the "found" success state.

### 4.3 Hall of Fallen Foes [S]

- **Header:** back arrow (left), refresh (right).
- **Hero:** a full-width render of the boss (Gohma) with its name below the image, a small **medal badge overlapping the lower-left of the image**, and a divider.
- **Tabs:** **Records** and **Rankings**.
- **Records tab:**
  - "Best time:" label and a big gold time "**01:06.26**".
  - A vertical list of four **tier cards**: **Bronze** (01:30 or below, earned), **Silver** (01:00 or below), **Gold** (00:40 or below), **Master** (00:20 or below). Unearned tiers show a grey silhouette and the text "Keep at it...".
- **Rankings tab:** present but not seen. Nintendo's text says there is a worldwide ranking of top times [T]. A third-party review says there are no leaderboards in the game itself [T, conflicting]. Nintendo's own screenshot of a Rankings tab is the stronger evidence.
- **In-game side [T]:** after sleeping in a glowing green bed, a hall lets you rematch bosses with a timer; the app displays your results.
- **Thresholds shown are for Gohma only.** Other bosses almost certainly have different thresholds [I].

### 4.4 Today's Record [S]

Two tabs under the header: **Timeline** and **Data**.

**Timeline**
- Heading "**Records for November 5, 2026**".
- A **vertical rope/braid line** down the left with **diamond nodes**. A node is hollow-grey for a plain screenshot, **gold** for a notable event.
- Entries are a **time stamp** (15:40), an optional **event title in bold** ("First visit: Hyrule Castle Town"), and a **wide screenshot**. Newest first.
- Screenshots are taken automatically during play [T].

**Data**
- "Last updated: 11/5/2026, 23:00" under the heading (so data is a periodic upload, not live) [I].
- A card with:
  - **Total time played** ("+50 minutes"), then **Time Spent by Area** (Hyrule Field +30 minutes, Hyrule Castle Town +20 minutes).
  - **Enemies Defeated** (+2) with a progress bar and "Remaining to next tier: 98".
  - **Consumable Items Used** (+16), "Remaining to next tier: 184".
  - **Special Item Uses** (+13), "Remaining to next tier: 87".
  - The card scrolls further. A third-party page, citing the Nintendo Direct footage, also lists rupees earned, hearts lost, game overs, distance travelled, grass cut and jumps [T, third party].
- The values are **deltas for that day** ("+"). "Next tier" suggests these feed lifetime medals [I].

### 4.5 My Play Data [S]

- Header band with title and "?".
- **Profile:** a round avatar (a Link portrait) with a **pencil badge** to edit, and the player name below ("Evan").
- A **row of six small medals** (earned medals, highest-ranked first or most recent) [I].
- A **3x2 grid of medal tiles**. Each tile is a shield-badge on a brown card with a gold border, a **progress bar** under the badge, and the medal's name beneath. Examples shown: **Citizen of Hyrule** (hourglass, silver), **Wealthy One** (gem, bronze), **Distance Trekker** (footprints, bronze). Locked tiles show a dark silhouette and "???".
- **Footer bar:** "**Rupees Banked**" with a green rupee icon and the balance (120).
- **Medal themes inferred from the glyphs [I]:** play time, rupees, distance walked, enemies defeated, items used, treasure. A full list is not documented.

### 4.6 Global Play Data [S]

- Header band with title, "?" and a gear.
- Section label **Combat**, then cards:
  - **Enemies Defeated: 102**, with a **histogram** titled "Global Play Data": x-axis "Enemies Defeated" (10 buckets, last one "100 +"), y-axis "No. of Users". A small **avatar pin** marks which bar you are in. An expand/collapse chevron is at the bottom of each card.
  - **Types of Enemies Defeated: 10** with a "**You Are Known for... Defeating Deku Babas**" line (your most-defeated type).
- Section label **Deaths**, then **Game Over Count: 1**.
- The scroll continues (not seen).
- A third-party page says Nintendo Account privacy and usage-data settings must allow sharing for this screen to appear [T, from the sibling app guide].

### 4.7 Photo Studio [S]

- A modal editor titled **Edit Image** with **X** (left) and **Complete** (right).
- The photo sits in a **decorative lace-like frame** with overlays placed on top: a game title logo (top-left) and a **round gold "300" stamp** (bottom-right).
- Below, a dark panel with **four tabs: Frames, Title Logos, Icons, QR Codes**.
- The grid shows selectable options (here, title logo variants: gold, white, red, and a "Zelda Notes" crest). The selected item has a glowing white-blue outline.
- Nintendo's text adds cropping and sharing [T, third party]; the sibling app's Photo Studio can attach item and blueprint QR codes [T].

### 4.8 Threads of Time+ [S]

- A dark stone-wall backdrop with a **tapestry hanging from a gold rod**.
- Header controls: house, refresh, gear. Title "**Threads of Time+**" with "?".
- The tapestry is a **vertical woven banner** with ornamental borders. The **top portion is lit and illustrated** (the Great Deku Tree, Hyrule Castle, characters in arches, bosses, fire and wind motifs). **Below, a central Triforce medallion and a sword** and a series of **dark, unrevealed panels** that fill in as the story advances.
- A **blank scroll area** at the bottom [I] likely shows the selected scene's title or description.
- Tapping an illustrated panel replays that cutscene [T] (needs a cutscene seen in game first).
- **In-game counterpart [T]:** the pause menu has a Threads of Time tab between Key Items and Map, with a quest list, "???" for unreached quests, and **Press Y to open the tapestry**. The "+" in the app's title suggests the app's version adds cutscene replay [I].

### 4.9 amiibo [S]

- Header: back arrow, refresh.
- A large **photo of the figure** (Link - Ocarina of Time) on a black textured background, with a **zoom** button at its lower right and **two thumbnails** (figure, box) below.
- The name in bold, a divider, "**Date released: 12/2/2016**".
- A chamfered panel with **five diamond pips**, one lit, then text: "**If you scan this amiibo 4 more time(s), you'll be able to scan it an additional time.**"
- **Behaviour [T]:** each figure gives one in-game item per day; five scans unlock one extra scan that day. Scanning itself happens on the console, not the phone [T, third party].
- **Not seen:** the list of figures and any "unscanned" state.

### 4.10 Play Ocarina [S]

- Title "**New score**", a back arrow, and a "..." menu.
- A large **render of the ocarina** (blue with a silver Triforce mount, six holes). Tapping the holes plays notes [T].
- Controls: a **rewind** button, a **play** button and a **"Guided Play"** chip with a small ocarina icon.
- Below, a **piano-roll editor**: horizontal rows for note names (E D C B A G F E D C B), vertical beat lines, and cream-coloured **note blocks** (G, D#, F, C, C) whose length is the note's duration. A yellow **playhead line** is at the left.
- **Modes [T]:** Free Play, Guided Play (shows which note and for how long), Demo Play (plays by itself). Custom scores can be written, saved and shared as **QR codes**.
- **Scores [T, third party]:** Link's Scores (14 songs) come from story progress; Gossip Quest scores cost points; 10 background themes.
- Separate from the in-game microphone ocarina feature [T].

### 4.11 Ocarina of Time Quiz [S]

- A top bar with "**Question 1**" (left) and "**Cucco Level**" (right).
- The question in large white text, centred ("Which treasure chest contains the Kokiri Sword?").
- A **circular countdown** at the right showing "27" in an orange ring.
- **Four photo answers in a 2x2 grid**, each in a brown frame.
- **Behaviour [T]:** over 2,000 questions; two difficulty levels (one level is "Cucco Level" [S]; the other level name is not documented, though a source mentions an "Egg Level"); **one free attempt per level per day**; extra attempts cost **20 rupees**. Another source says each question lasts 10 seconds [T, conflicting with the 27 shown here; the timer may differ by question or level].

## 5. How the game and the app talk to each other

Almost all of this is [I] or third-party [T]; Nintendo does not document it.

1. **Same account**, not a pairing code: the app and console are tied by the Nintendo Account that owns the save [T].
2. **Online, via Nintendo's servers**. The console uploads game events and the phone reads them [I]. It is **not a local connection to the console**: the APK has no local-network or NFC permission and the web view calls Nintendo's API (from the APK analysis).
3. **Liveness varies by feature:**
   - Map position: near real time (the sibling app says "every few seconds") [T].
   - Today's Record: has a "Last updated" stamp, so it is periodic [S].
   - Refresh buttons on Hall of Fallen Foes, Today's Record, Threads of Time+, amiibo [S] imply **pull-on-demand** data.
4. **Rupees flow one way** from the game to the app via shops in each town, and are spent in the app (quiz retries, quest hints) [T].
5. **Screenshots are captured by the game** automatically and uploaded, so Today's Record and Photo Studio rely on the game [T].
6. **Troubleshooting hints [T]:** same account and console user as the save, game 1.1.1+, both devices online, gameplay-data sharing permitted in the Nintendo Account, update the app/OS/Android System WebView, restart both.
7. **Not documented:** sync timing, offline behaviour, whether starting a new save resets app data, exactly where the in-game link/unlink option lives.

## 6. Exploring the app: the intended flow [I]

1. Open Zelda Notes, pick the game. See the 11 tiles.
2. **Daily loop:** check Today's Record, take the quiz (two free tries), scan amiibo on the console, check Gossip Quests.
3. **Exploration loop:** play the game with the phone as a second screen showing the Map; hide unvisited areas to avoid spoilers; see what you missed; hunt Gossip Quest locations; "Found!" to earn points.
4. **Collection loop:** earn points, spend them on sheet music, play ocarina songs, share by QR.
5. **Personal progress loop:** medals, Hall of Fallen Foes tiers and the tapestry.
6. **Social loop:** global stats, rankings, QR sharing.

## 7. What data the app shows, and whether we can get it

"Source" means where our companion could read the value. See `COMMUNICATION_PROTOCOL.md`, `GAME_STATE_AND_SAVE_FORMATS.md` and `spikes/S1_BRIDGE_RESULTS.md`.

| Data shown by Zelda Notes | Source in our design | Status |
|---|---|---|
| Link's map position and heading | Bridge `oot` event: `map`, `pos`, `facing` | Verified |
| Current area name | Bridge `map` event | Verified (raw IDs; friendly names need a table) |
| Hearts, max hearts, rupees | Bridge `oot` flags | Verified |
| Pieces of Heart / chests / Skulltulas collected (map) | Save file flags and live `changed` hashes | **Not done**: flag names must be recovered from the user's own files (spike S2) |
| Area completion % | Derived from the above plus a location list | Blocked on S2 and on a location data table |
| Today's Record screenshots | Bridge `shot` command (screenshot) | Command exists; use not yet exercised |
| Time played by area | Our own accounting from the sample stream | Feasible now |
| Enemies defeated | A `DefeatedEnemyNum.*` flag family | Seen in names; value changes not yet observed |
| Consumable / special item uses | Unknown | **Open** |
| Rupees earned, hearts lost | Derivable from sample deltas | Feasible |
| Game overs / deaths | `life == 0` with `event == true` | Partly (revival-in-place observed; true game over not) |
| Distance travelled | Integrate `pos` between samples | Feasible, approximate |
| Hall of Fallen Foes times | Unknown which flags hold timers | **Open** |
| Medal progress | Own definitions on our own counters | Feasible once counters exist |
| Gossip Quest images and 100 quests | Nintendo server content | **Not available**; we would need original content |
| Rupee "banking" | A mechanic of Nintendo's in-game shops | **Not available** (would need a game change) |
| Quiz questions | Nintendo's 2,000+ | **Not available**; original questions only |
| Cutscene replay | Needs the game to replay it | Not available |
| Global Play Data / rankings | Needs a server of players | Not available (local-only comparisons possible) |
| amiibo | Console NFC | Not available |

## 8. What an original companion could do for each feature

This keeps the *ideas* and drops Nintendo's assets and server dependencies.

| Feature | Original take |
|---|---|
| Map | Our own illustrated area maps (or a clean vector style) with live position, collected/missed markers, completion %, and hide-unvisited. |
| Today's Record | Timeline of our own events and our own screenshots, plus a Data tab of daily deltas. |
| My Play Data | Local profile, medals defined by us (time, rupees, distance, enemies), progress bars. |
| Hall of Fallen Foes | Boss records only if the timers become readable; otherwise a list of bosses defeated. |
| Threads of Time+ | A progress tapestry drawn by us from story flags; no cutscene replay. |
| Gossip Quests | Our own hint-image quests are possible later (requires making images), low priority. |
| Photo Studio | Frames/stamps that we draw; attach a share code. |
| Play Ocarina | Fully offline and straightforward: a touch/click ocarina with our own audio, a piano-roll editor, and scores we write. Good early win and a self-contained feature. |
| Quiz | Our own original question bank. |
| Global Play Data | Local history only, unless a future opt-in backend is ever wanted (out of scope). |
| amiibo, rupee banking, official leaderboards | Not reproducible. |

## 9. Design token direction (our own)

These are original choices inspired by the *feel* above, not sampled from Nintendo's files.

- **Backgrounds:** deep brown-black with subtle paper texture; map screens in warm parchment.
- **Accent:** gold for values and rewards; teal for "connected"; amber for warnings; muted red for danger.
- **Type:** an open-licence decorative serif for big numbers and titles (for example a free display face), a clean open sans for body text.
- **Shapes:** chamfered card corners, thin double borders, a torn-paper header edge as an SVG, small flourish dividers, shield-shaped medal badges drawn by us.
- **Icons:** drawn from scratch or from an open icon set; no game logos, emblems or characters.

## 10. Differences from the official app that we should expect and design for

- We are **local and live**; they are **cloud and periodic**. A real advantage: we can update the map and stats continuously with no account.
- We cannot read some data they can (Hall timers, item-use counters) until reverse-engineered.
- We have **no server content**: no Gossip Quest bank, no quiz bank, no global ranking. Anything like that has to be our own.
- Because we sit beside the PC game, the screen can be a second monitor, an overlay, or a phone browser (the last needs a deliberate, authenticated local-network design; it is not in scope now and the bridge is local-only).

## 11. What we may and may not reuse

**May use:** the list of features and their documented behaviour; the general screen structure (home tiles, tabs, timeline, medal grid, histogram); the *idea* of an adventure-journal look; our own wording.

**May not use (and should not copy even approximately):** any Nintendo image, icon, logo, emblem, character art, map art, ocarina render, tapestry art, medal art, font files, sound, or text copied verbatim (such as Nintendo's rumor text or quiz questions). The downloaded screenshots stay in a scratch folder outside the repository and are not distributed. Trade-dress risk (an overall look that is confusingly similar) is a legal question that is **not resolved here**; it belongs on the legal-review list.

Distinct naming and an "unofficial, not affiliated with Nintendo" notice remain in force.

## 12. Sources

Nintendo (official):
- Nintendo UK product page: https://www.nintendo.com/en-gb/Games/Smart-device-games/ZELDA-NOTES-2790439.html (11 phone screenshots and 9 in-game screenshots hosted under `https://www.nintendo.com/eu/media/images/assets/smart_device_9/zelda_notes/ocarinaoftime/`)
- Nintendo AU page: https://www.nintendo.com/au/apps/zelda-notes/
- Nintendo US support: https://en-americas-support.nintendo.com/app/answers/detail/a_id/68605

Third party (text read; accuracy not independently verified):
- Game Rant: https://gamerant.com/zelda-ocarina-of-time-remake-zelda-notes-app/
- Perfectly Nintendo: https://www.perfectly-nintendo.com/the-legend-of-zelda-ocarina-of-time-details-about-some-zelda-notes-features-with-footage/
- Zelda Central (Threads of Time and Zelda Notes): https://zeldacentral.com/games/ocarina-of-time-remake/threads-of-time/
- OoT Guide: https://ootguide.com/guides/zelda-notes/
- Questfern: https://questfern.com/guides/zelda-notes-guide/
- Space4Games: https://space4games.com/en/games-en/zelda-ocarina-of-time-remake-zelda-notes/
- Console Pulse (OoT): https://consolepulse.com/nintendo/zelda/guides/zelda-ocarina-of-time-zelda-notes-features-requirements
- Console Pulse (BotW/TotK): https://consolepulse.com/nintendo/zelda/guides/zelda-notes-complete-guide-botw-totk
- Gamertag Mythras: https://gamertagmythras.com/blog/zelda-ocarina-of-time/ocarina-of-time-zelda-notes-guide (the author says they have not used the app)
- Gfinity: https://www.gfinityesports.com/article/everything-you-need-to-know-about-the-new-zelda-notes-for-switch-2 (BotW/TotK only)
- GSMGoTech: https://www.gsmgotech.com/2026/11/zelda-ocarina-of-time-remake-gets.html
- games.gg (Hall of Fallen Foes): https://games.gg/the-legend-of-zelda-ocarina-of-time-2026/guides/ocarina-of-time-remake-hall-of-fallen-foes-unlock-and-boss-rematches/
- Final Boss (Threads of Time, Hall): https://finalboss.io/zelda-oot-switch-2-hall-of-fallen-foes-fairy-lore-tapestry
- Game Informer, Zelda 40th Anniversary Nintendo Direct recap: https://gameinformer.com/nintendo-direct/2026/09/08/everything-announced-at-the-zelda-40th-anniversary-nintendo-direct

Pages that could not be read: Game8 (HTTP 402), Zelda Wiki (HTTP 403), and the two YouTube guide videos (page chrome only).

## 13. Open questions and how to close them

| Question | What would answer it |
|---|---|
| Home screen layout, tile order, tile art and any banners or badges | A screen recording of the app's home |
| Transitions, scrolling, pull-to-refresh, loading and offline/empty states | A screen recording while navigating every tile |
| Gossip Quest index, hint screen, points balance and the success state | Recording of a full Gossip Quest cycle |
| Hall of Fallen Foes list view, the Rankings tab, tiers for other bosses | Recording of the Hall tile and a few bosses |
| The Map's filter sheet, Area Completion list, area picker and dungeon maps | Recording of the Map including a dungeon |
| Photo Studio entry path from Today's Record; sharing flow | Recording of selecting a screenshot and finishing |
| The Quiz's second level, result screen and rewards; timer length | Recording of one full quiz |
| Where the in-game link/unlink option lives and what rupee transfer looks like | Recording of the console side |
| What the app does when the account has no save or no game connection | Recording with the game closed |

If you record these, I can turn them into a screen-by-screen spec with exact element lists and flows and update this reference. Keep recordings on your own machine, and I'll describe and not copy what is in them.
