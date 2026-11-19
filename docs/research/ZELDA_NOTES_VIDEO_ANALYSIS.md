# Zelda Notes: walkthrough video analysis

Evidence from one public walkthrough of the whole Zelda Notes app, used to close the gaps listed in
`ZELDA_NOTES_UI_REFERENCE.md` (Home screen, transitions, Hall detail, Today's Record data, quiz timer).

## Source and handling

| Item | Detail |
|---|---|
| Video | "The 100% Correct Way to Use Zelda Notes (Ocarina of Time)", channel PhillyBeatzU, uploaded 2026-11-12, 17 min 28 s, 1280x720. URL: `https://www.youtube.com/watch?v=poXxSGOCK-o` |
| What was read | The English captions (auto-generated, uploader's own speech) and about 90 frames from the phone overlay. Chapters in the video: Map 0:50, Gossip Quests 4:40, Hall of Fallen Foes 7:30, Today's Record 9:15, My Play Data 10:00, Photo Studio 11:30, Threads of Time 12:30, amiibo 12:57, Play Ocarina 14:07, Quiz 15:15. |
| Where files are | `C:\Users\finnl\research-clones\zn-video\` (captions, frames, video). **Outside the repo, not distributed.** Frames and the video are Nintendo's UI and the creator's footage; they stay private reference only. |
| How it is used | Descriptions of layout and behaviour, with short quotes. No screenshot, icon, text asset or copy from the app goes into Ocarina Journal. |
| Reliability | One player's screen on one account (Switch 2, Nintendo Switch app on a phone, game build with Zelda Notes). The overlay is small, so exact colours, fonts and pixel sizes are **not** taken from it. Numbers in examples (997 enemies, 76%) are that player's, not rules. |

Tags: **[V]** seen in the video frames, **[C]** said in the captions only, **[P]** carried over from the earlier reference doc, **[U]** unknown.

## 1. Home ("Titles") [V]

The earlier reference had no Home screen. It is a **launcher grid**:

- Header row: a four-square "grid" icon with the label **Titles**, the game logo, and a "..." menu at the right.
- Background: a dimmed photo of a game scene (a forest), not a flat colour.
- **3-column grid of framed square tiles**, each an icon with a caption underneath:
  1. Map, 2. Gossip Quests, 3. Hall of Fallen Foes,
  4. Today's Record, 5. My Play Data, 6. Global Play Data,
  7. Photo Studio, 8. Threads of Time (shown "Threads of Time+"), 9. amiibo,
  10. Play Ocarina (an ocarina icon), 11. Ocarina of Time Quiz (a graduation cap).
- A small **yellow dot** on a tile (My Play Data, Photo Studio, amiibo in the frame) marks something new.
- Tile frames are gold-bordered parchment squares; My Play Data and Hall use a portrait image instead of a line icon.

Entering a feature shows its own header with a **home icon top-left** (back to Titles), a refresh icon top-right, a small grey line "The Legend of Zelda: Ocarina of Time", then the feature name with a **"?" help button**. The Map uses an arrow instead of the home icon when inside an area.

## 2. Map [V]

Three levels, plus panels.

**World map.** Title "Map ?", home icon, gear and a green sync icon top-right. The map is a hand-illustrated Hyrule with area names on banners. A pill at the bottom reads **"Completion Progress 76%"** (75% earlier in the same video). A round **location** button and a round **filter** button sit at the right. A white pill appears when the map era differs from Link's: **"Switch map to Link's current era >"**.

**Zoomed regions.** Zooming shows banners with **small count badges** (for Goron City: hidden hole 0/1, skulltula 1/1, heart piece 1/1, chests 2/4). The same style is used for Bottom of the Well (events 1/1, a scrub 0/1, skulltulas 0/3, chests 4/12).

**Area view.** A torn-parchment header: back arrow left, green sync icon and gear right. The area name sits under it in a serif face with an ornamental underline. Exits are drawn as **chevrons** at the map edge. The **Link marker is a red arrow** on the area map. The pill is now **"Area Completion 58%"**.

**Area Completion sheet** (tap the pill): a bottom sheet with a grab handle, a close (x) button and the title "Area Completion". It shows the area name and big percentage, **Child | Adult** segmented tabs, then rows such as "Hidden Holes 0/1".

**Completion Progress sheet** (tap the pill on the world map): title "Completion Progress", a big **76%** with the label "Area Achievement Rate", then a list of areas, each a banner photo with a percentage: Kokiri Forest 58%, Great Deku Tree 90%, Lost Woods 100%, Sacred Grove 100%, Forest Temple 68% [V].

**Marker sheet** (tap a marker): bottom sheet with the marker icon, its name, a status word ("Complete"), and a **Required** panel listing what is needed: items (Deku Stick, Bombs), or a condition (Night). A Piece of Heart example needs Deku Stick and Bombs [V]; a Lost Woods heart piece needs Saria's Song played [C].

**Display Filters** (filter button): bottom panel "Display Filters" with **Display Settings** (Era: Child | Adult; Completion Progress: Incomplete Only | All) and **Display Items** grouped as Locations (Hidden Holes, Gossip Stones, Fresh Soil, Scarecrow Spots, Fairy Thoughts, Events), Characters (Enemies, Business Scrubs) and more below (Treasures) [V]. Each is a toggle tile.

**Map settings** (gear): a plain page with three switches: *Display Undiscovered Categories*, *Display Maps of Unexplored Dungeons*, *Display Contents of Treasure Chests* [V].

Behaviour [C]: the map follows Link live and **switches area when he changes area, including places with no in-game map** (Lost Woods, Gerudo Training Ground, Ganon's Castle). If the map did not follow, tapping the location button recentres on Link. When an item is collected in the game, its marker updates; the narrator saw this after picking up a Piece of Heart. Enemies show as dots in the field when the Enemies filter is on.

## 3. Gossip Quests [V]/[C]

- Header with a **Connected** label at the top-right on this screen. Two tabs: **Quests | Rewards**.
- 100 quests ("rumours") in total, each worth points. In-game, interacting with the right thing finds the rumour: for example tapping the cow in Link's house revealed "rumor number seven found" and added 50 points [C].
- A quest card shows its image, points and found/not found state; a counter reads "0/100 Completed" and a **Sort** control sits above the list [V].
- **Rewards tab:** a grid of **sheet-music rewards**, each **300 P** (Series Theme, Title Theme, House, Kokiri Forest, Shop, Kakariko Village...). At the bottom: **Gossip Points 90 P** and a bar "Reward Redemption 210 P" [V]. Redeemed rewards appear under Play Ocarina, in "Gossip Quest Scores" [V].
- **Hints** [C]: "Get a hint" costs **20 rupees**. The rupees must first be **banked** from the game: in a shop, the shopkeeper's menu has a Zelda Notes option ("Zelda Notes Co.", via the "Hyrule Merchant Guild"); you choose an amount and it transfers to the app. Afterwards the hint screen shows "Rupees banked 100". Confirming a hint spends them and reveals the exact location.
- **Nearby feedback** [C]: when you approach a rumour's target, the quest shows a message that it is nearby, then "get closer", then "found" once you are at the spot.

## 4. Hall of Fallen Foes [V]

- Unlock in the game: finish the Forest Temple as adult, go back to child, then talk to the owl in Kakariko Village; afterwards beds in the game give access to the Hall [C].
- **List screen:** each row is a framed card: enemy portrait on the left fading into the card, the **name** right-aligned, a **medal ribbon** at the right (grey silhouette if no record) and the **best time** in gold under the name (for example `00:14.40`). Order starts with Wolfos, Meg Firstborn, Stalfos (Forest Temple), Lizalfos, Flare Dancer and continues through the bosses to Ganondorf and Ganon, ending with three **trials** as larger entries: Trial of the Spiritual Stones (03:46.43 in the frame), Trial of the Five Sages (12:41.33), and Trial of the Hero of Time (locked) [V].
- **Detail screen** (for example "Stalfos (Forest Temple)"): header with refresh; **Records | Rankings** tabs.
  - *Records:* "Best time:" with a dash if none; four tier cards, each a medal silhouette, tier name, hint "Keep at it...", and the time **"or below"**: Bronze 01:00, Silver 00:45, Gold 00:30, Master 00:15 for this Stalfos [V]. (The earlier reference's Gohma tiers were different, so thresholds are per enemy.)
  - *Rankings:* two dropdowns, a period (**This week**) and a language/region (**English (US)**), a line "This week's best time:", the date range (for example November 9 to 16, 2026), then ranked rows: position, **player name**, time (`Purifier37 00:09.63`, `Max 00:09.90`...) [V]. The narrator also compared US and Japan lists [C].
- **In-game side:** the Hall entry shows a description, "Main Locations", **"Rematch Time"** (`--:--.--` until done) and a **Rematch** button [V]. After a rematch the app shows the new best time once refreshed (24.53 s in the example) [V]. The refresh button at the top-right is how the list updates.

## 5. Today's Record [V]

- Tabs **Timeline | Data**.
- **Timeline:** heading "Records for November 11, 2026". A vertical **braided rope line** with **diamond nodes**. Each entry: time (`17:56`), a bold title (**"Defeated Stalfos"**), then a **screenshot** taken by the game at that moment. Milestone entries put a **gold coin badge** on the screenshot (the number 900 for *Times Targeting Was Used: 900*, 70 for *Rocks Lifted: 70*, *Times Grass Was Cut: 4,000*).
- Newest first. Screenshots come from the game itself ("it really is screenshotting everything I'm doing") [C].
- **Data tab:** a card of lines, label left, **"+N" in large numerals** right: Times Grass Was Cut +271, Pots Destroyed +1, Times Targeting Was Used +4, Times Jumped +129, Roll Attacks Performed +47, Sword Swings +118, and more above (for example total time played 138 minutes [C], enemies, items) [V].
- Footer: "Data is calculated each hour and updated if there are any changes. **Data collected between November 11, 2026 at 05:00 and November 12, 2026 at 04:59.**" So the **day runs 05:00 to 04:59** local time [V]. This is a concrete rule our "today" should copy as a design choice.

## 6. My Play Data [V]

- Header, then a **circular avatar** (a Link portrait the player may change) and the **display name**.
- A **compact row of small medals** (two rows of nine) summarising progress, then a **2-column grid of large framed medals** with their names: Citizen of Hyrule, Monsters' Bane, Wealthy One, Distance Trekker... (earlier plan said 3x2; the real grid is **2 columns**, scrolling) [V].
- The medal being worked on has a **yellow progress line** under it [V].
- Footer bar pinned at the bottom: **"Rupees Banked"** with a green rupee and the amount (80) [V].
- **Medal detail:** large medal art and name, tier ("Gold"), the rule ("Earned by increasing your Enemies Defeated stat"), the stat (**Enemies Defeated 997**), "Remaining to next tier: 3" with a yellow bar, a **View Global Play Data** button, then **Medal Status**: four rows Bronze 100 (earned on 11/3/2026), Silver 300 (11/4), Gold 500 (11/5), Master 1,000 (locked, "Keep at it...") [V].
- Update lag [V]: "Data is calculated each hour".

## 7. Global Play Data [V]

- Header with gear (settings). Sections: **Combat**, **Deaths**, and more below.
- A card per statistic: title and your number (Enemies Defeated **997**), then a **histogram** of all users with a marker for your position and a label such as "800 +" [V]. Cards expand and collapse with a chevron at the bottom.
- Other cards: **Types of Enemies Defeated 49**, with a line **"You Are Known for... Defeating Stalchildren"**; **Game Over Count 4**; **Game Over Causes 4**, "You Are Known for... Falling Victim to ReDead/Gibdos" [V].
- A **Return to My Play Data** pill at the bottom.

## 8. Photo Studio [V]

- Section **Milestone Images** (with a chevron to open all) shown as a horizontal carousel, captioned for example "Enemies Defeated: 1,000".
- Tabs **All | Unedited | Edited**, a counter **"0/300 Images"**, **Filter** and **Select**, then a wide **Import Images** button.
- **Image detail:** large image with a milestone badge; "Milestone reached: 11/11/2026, 18:54"; "Enemies Defeated: 1,000"; a hint balloon "You can edit the image by touching Edit"; a gold **Edit** button; note "Milestone images cannot be set as profile pictures."; row of **Share**, **Save as Image**, **Set as Profile Picture** (disabled for milestones).
- Importing [C]: the player takes in-game screenshots and imports them; it is not instant.

## 9. Threads of Time [V]/[C]

A zoomable **tapestry** poster that fills in as the story advances. It reflects in-game progress and the same image appears in the game's Threads of Time screen [C]. Header: home icon, "Threads of Time+", refresh, gear.

## 10. amiibo [V]/[C]

- "16/35 Registered" with a **sort control** (Most used, Newest release).
- 2-column grid of framed figure images with the **name** under each, a **"New"** ribbon on new ones, and **five diamond pips** under each figure showing the daily-scan streak [V].
- Rules [C]: one scan per day per amiibo; five consecutive days earns an extra scan and the pips reset. Only registered (scanned) figures appear. Needs amiibo enabled in the game's system options.

## 11. Play Ocarina [V]

- Header "Play Ocarina ?", three tabs: **Play | Game Scores | Original Scores**.
- *Game Scores* has a segmented switch **Link's Scores | Gossip Quest Scores**, a counter "Scores collected: 14", a grid of framed icons (Zelda's Lullaby, Song of Time, Sun's Song, Song of Storms...), and a **QR Code Scanning** bar at the bottom.
- *Score detail* (Zelda's Lullaby): a 3D-style ocarina picture, transport controls (restart, play), a **Guided Play** button, a segmented **Play only the beginning | Play the full version**, and a **staff** with the clef and note circles labelled with button letters (X, Y, A) [V].
- *Play:* a large picture of the ocarina to touch (finger holes); a **Record Performance** button on the left edge and **Playing Instructions** at the right; note "You can play the ocarina by touching the holes." [V].
- Saving a recording [V]: a dialog "**Score Name**, You can enter a name between 2 and 20 characters long", fields **Save** and **Return to Recording**. Saved scores can be shown as a **QR code** and read by another phone [C]. Players can switch the ocarina style (Fairy Ocarina) [C].

## 12. Ocarina of Time Quiz [V]/[C]

- Levels shown as cards: **Egg Level**, **Cucco Level** (cards with the picture and "Highest number of consecutive correct answers: 0/20 and 0/30"), and a locked **Cojiro Challenge** [V]. The footer shows **Rupees Banked** [V].
- Starting: a **3-2-1 countdown** in a red ring, with a **Return to Quiz Selection** button [V].
- Question: header "Question 2" and the level name; the question text; a **circular countdown timer** (15 s in the frame at the start, then counting down: 8) [V]; four answers as **2x2 pictures** [V]; after answering, ticks and crosses overlay the choices [V]. Some questions are text or true/false in the captions [C].
- After a run: a new record for consecutive correct answers and medals; retrying costs **20 rupees**; the top level needs the Master medal [C].
- Resolves the earlier conflict: the question timer is **15 s** in this frame, not 27 or 10.

## 13. Sync and data rules observed

- A **green sync icon** (two arrows beside a Switch outline) at the top-right of most screens, and "**Connected**" on others, tells the user the game is linked [V]/[C].
- Refresh icon at the top-right on list screens refreshes data [V].
- Some data is **hourly** (stats) and some **near-live** (map position, found markers, Hall times after refresh) [C].
- **Rupees are bridged from the game** through a shop interaction and spent on hints and quiz retries [C].
- The Notes data comes from the **Switch 2 game and Nintendo's servers**; this is not available to a PC port (see `COMMUNICATION_PROTOCOL.md`).

## 14. What this changes for Ocarina Journal

| Area | Earlier plan | After the video |
|---|---|---|
| Home | 2-column grid of 10 tiles | A **3-column grid of framed tiles** with captions, a "Titles" header, a notification dot, and a dimmed scene background |
| Medals | 3x2 grid | **2-column grid**, plus a compact row of small medals above, and a pinned "Rupees Banked" bar |
| Day boundary | midnight | The original uses **05:00 to 04:59**; ours can follow that so late-night play counts as one day |
| Hall detail | Gohma example tiers | Tier times are **per enemy**; list rows show **portrait, name, medal ribbon, best time in gold** |
| Today timeline | placeholder shots | Milestone **coin badges** on screenshots; entries are the game's own screenshots with a time and a title |
| Today data | enemies, consumables | Wider list: grass cut, pots, targeting, jumps, rolls, sword swings, rocks lifted |
| Map | single area art | **Three levels** (world, area, marker sheet), filters, a settings page, a **Required** panel on markers, chevron exits, an era switch |
| Quiz | text answers | **2x2 picture answers**, 15 s timer, 3-2-1 intro, ticks and crosses |
| Play Ocarina | piano roll | **Ocarina picture with touch holes**, staff notation with button letters, Guided Play, Record Performance, name dialog (2-20 characters), QR share |

## 15. What our data can support

| Feature | Possible from the bridge and saves? | Basis |
|---|---|---|
| Map completion (areas, chests, skulltulas) | **Yes, with the name table** | The save report counts chests (93/184), Gold Skulltulas (55/100) and has positions; names need the flag-name and placement reader |
| Hall list and bests | Counts **yes** (66/79 enemy types, 6/10 bosses); **best times unknown** | The save has kill counters; the time records have not been located |
| Today's Record stats (grass, pots, jumps, rolls, swings) | **Unknown** | These are game counters; they may be in the save flag table, but I have not identified them |
| Today screenshots | **Needs a capture command** | The bridge can write a PNG, but that is a write capability and needs separate consent |
| My Play Data / medals | **Partly** | App-defined medals from save counts and session data; the originals' thresholds (for example 100, 300, 500, 1,000 enemies) are readable here |
| Global Play Data | **No** | Needs other players' data from Nintendo's servers; could only be an original local comparison |
| Gossip Quests | **Partly** | Needs the rumour placements; 100 quests; rewards unlocking sheet music is a game of our own |
| Photo Studio | **Needs capture and our own editor** | |
| amiibo | **No** | Needs the console's NFC |
| Ocarina, Quiz, Threads of Time | **Yes** | No game data needed for the first versions; Threads would use story progress |

## 16. Still unknown

- Exact visuals and sizes of the Home tiles (the overlay is small).
- Whether the Hall times come from the save or are computed in the game.
- How "Today's Record" screenshots are chosen.
- Quiz questions and scoring beyond the examples seen.
- Whether any of these features work offline in the original.

## 17. Reuse limits

Ocarina Journal reuses **none** of Nintendo's art, icons, text or screenshots. Layout structure, information design, rules (such as 05:00 day boundary, tier counts) are re-implemented as our own design. Names of enemies, areas and songs are facts from the game; their presentation is ours. Legal review is still pending (see `RISKS_AND_LIMITATIONS.md`).
