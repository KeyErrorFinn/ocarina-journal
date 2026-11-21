# The game's own maps

**Date:** 2026-11-20. **Game files:** Longshot v3.0.0-rc.5. **Code:** `crates/oj-gamedata/src/{tex,maps}.rs`, `app/src/maps.ts`,
`app/src/screens/MapScreen.tsx`.

The Map screen now shows the same pictures the game's own map menu uses: the painted world map, each area's map
per age, and each dungeon floor. They are **read from the player's own game folder at run time** and cached under
`%LOCALAPPDATA%\OcarinaJournal\maps\`. None of them is in the repository or the app. If the game files cannot be
read, or the player turns the setting off, the app falls back to its own drawn paper.

Tags: **[V]** verified, **[I]** inferred, **[U]** unverified.

## Where everything comes from

| What | File (RomFS) | Notes |
|---|---|---|
| Places, picture names per age | `Game/MapMenuInfo/MapMenuInfo.game__ui__MapMenuInfo.bgyml` | 31 places in a fixed order. [V] |
| Picture centre and scale | `Game/MapCaptureInfo/MapCaptureInfo.game__MapCaptureInfo.bgyml` | Same order as MapMenuInfo (see below). [V] |
| Dungeon floors, field exits | `Banc/BancBasedResource/MapParam.byml.zs` | `Floor[].TransY` lowest first, numbered from `MinFloor`; `EntranceAnchor` per field Banc. [V] |
| Area and floor pictures | `UI/CustomTex/Map/Field/*.bntx.zs`, `UI/CustomTex/Map/Dungeon/*.bntx.zs` | 2000×1440; dungeon floors are layers (`Main`, `Back`, `Alpha`, `Grad`, and `All` for the whole dungeon). [V] |
| World map picture | `MapTexWorldAll_00` in `UI/Layout2Archive/Common.Product.100.Nin_Ounce_NVN2.bntx.zs` | 4608×3360. [V] |
| Place names on the world map | panes `Pa_*_00` of `PaMapWorld_00.buil` in `Common...blarc.zs` | Layout units, origin at the centre, +y up; the picture pane `P_WorldMap_00` is 7680×5600. [V] |

## Textures

BNTX files built for Switch 2 (`Nin_Ounce_NVN2`). The map pictures are ASTC (5×5 and 6×6 sRGB), the masks BC4 and
R8G8. The data is block linear but **with the Switch 2 GOB layout**. The Tegra X1 layout (as in `tegra_swizzle`)
gives a picture scrambled block by block. The Switch 2 layout is the one in Longshot's `gpu/vk/texture_tiles.h`
(GPL-3.0). Inside a 64×8-byte GOB, row `r` is four 16-byte pieces at `(r & 3) * 16 + (r >> 2) * 128` plus 0, 64,
256 and 320. Decoded pictures were checked by eye: icons, the world map and every field map. ASTC and BC are decoded
by `texture2ddecoder`. [V]

## Where a world position falls on a picture

- **Capture entry *i* is place *i* of MapMenuInfo.** Every placed chest, Skulltula and heart of each area falls
  inside its entry's rectangle, for all 31 places. [V]
- **`CameraPos` X/Z is the picture's centre, and `Height` is the metres across the picture's width.** +X runs to the
  right and +Z runs down. [V] This was checked three ways:
  - Kokiri Forest landmarks from its Banc: the Deku Tree at (103, −30), the Lost Woods gate, and the Hyrule Field
    exit.
  - The `MapIconEntranceAnchor` exits of Hyrule Field and Gerudo Valley land on the ends of the drawn paths. With
    1440 px per `Height` they do not.
  - The Forest Temple's own chest positions in `MapParam` (`Floor[].TBox`) land exactly on the report's chests on
    every floor.
  - Flipping Z clearly fits worse.
- **Floors:** a thing is on the highest floor whose `TransY` is at or below its height plus 1.5 m. [V] for the
  Forest Temple, where the game's chests per floor match. Other dungeons: [I].
- **Link's facing** (`game.facing` from the bridge) is in degrees: 0 faces +Z and the angle increases toward +X.
  The arrow is drawn at `rotate(180° − facing)`. [V] Movement direction in 2,074 recorded samples agrees within
  ±15° for most of them.

## Lake Hylia and Lon Lon Ranch

These two have map pictures but no Banc folder of their own. Their things are placed in Hyrule Field's Banc, in
Hyrule Field's coordinates. The bridge also reports Link as in `HyruleField_*` there. [V] The app sends a 100-wide
"is drawn" grid of each of their pictures and moves a Hyrule Field point to Lake Hylia or Lon Lon Ranch when it
falls on that picture. The game itself probably uses the location shapes in `Work/Location/*.gyml` (not read). [I]

## Not settled

- **Water Temple** floors have three water levels (`_Lv1_` to `_Lv3_`). The app shows level 1; which level the game
  shows when is not read. [U]
- Dungeon states (`_State00_` / `_State01_`, e.g. after a switch) are not read; the app shows state 00. [U]
- Rooms revealed so far (the `Alpha` masks) are not used. The app shows every floor fully, like the original app's
  "Display Maps of Unexplored Dungeons" setting.
- Some Hyrule Field entries (probably grottos, which have their own coordinates) fall outside every picture. [I]
- Places with no map picture (Gerudo Training Ground, Inside Ganon's Castle) use the app's own paper.
- The pane-to-place pairing (`Pa_Village_00` = Kakariko Village, and so on) is matched by name, by us.

## The Threads of Time tapestry

**Date:** 2026-11-21. **Code:** `crates/oj-gamedata/src/tapestry.rs`, `app/src/screens/Tapestry.tsx`.

The Tapestry screen shows the tapestry from the game's Threads of Time menu, built the same way the game builds it.

| What | File (RomFS) | Notes |
|---|---|---|
| Empty cloth | `Tex/Cloth_TapestryChallengeMenu_Base_Alb.bntx.zs` | 1536×3072 ASTC. Drawn by the main model `Obj_TapestryChallengeMenu`. [V] |
| Every section as a silhouette | `Tex/Cloth_TapestryChallengeMenu_Alb.bntx.zs` | Used by the section models `<Section>`. [V] |
| Every section woven | `Tex/Cloth_TapestryChallengeMenu_Complete_Alb.bntx.zs` | Used by `<Section>_Complete`, and by `Obj_TapestryChallengeMenu_Static` on the whole cloth. [V] |
| Section outlines | `Model/Obj_TapestryChallengeMenu.<Section>[_Complete].bfres.zs` | 21 sections. Each model's texture coordinates (`_u0`) outline the section on the pictures. The silhouette and woven outlines of 11 sections differ: the woven Door of Time adds the Master Sword, and the woven All Sage leaves it out. [V] |
| Section names | `Component/ModelInfo/Tapestry_ChallengeMenu` in `Pack/Actor/Tapestry_ChallengeMenu.pack.zs` | Sub-models of the tapestry actor. They are the Threads of Time quests in `RSDB/Challenge` (`Meet_DekuTree`, `SageOfWater`, `SubEvent_GetScarecrow`...), whose step the save keeps in `Step_<Section>`. [V] |

- **BFRES:** version 10 for Switch 2, read only as far as the meshes. The offsets are listed in `tapestry.rs`. They
  were found by locating the vertex data (40 vertices of 28 bytes for `Meet_DekuTree`) and checked on every section
  model: all indices are in range, and every outline falls on its picture (e.g. `Meet_DekuTree` is the sleeping Link
  with Navi at the top left). [V]
- **Composition:** the app draws the empty cloth, then each section from the silhouette or woven picture, clipped to
  that state's outline. Silhouettes go first, so a woven section that overlaps one stays on top (our choice; the
  game's draw order is not read). [I] With every section woven, the result matches the full woven picture by eye. [V]
- **When a section is woven:** when its quest is complete (the same test as the Story and Side quests lists). [I]
  The game decides this in code (`ExecuteUpdateTapestry`), which is not read.
- **Silhouette or empty:** the app shows a silhouette once the quest has started (its step is past `Ready`), and
  otherwise leaves the panel empty, like the game's "???" for quests not reached. [I] That the game has both an
  empty cloth and a silhouette layer suggests it makes this distinction, but when it does has not been seen.
- **`GameClear`** (the band at the bottom, with no silhouette) is woven when `Defeat_Ganon` is complete. [I]
- Cutscene replay from a section (the Zelda Notes "+") is not done; see `FEATURE_PARITY_MATRIX.md`.

## Legal note

The map and tapestry pictures are Nintendo's artwork. The app only decodes them from the player's own installed copy, on the player's
PC, for display. This is the same way it already reads names from the game's text files. Nothing is redistributed,
and the setting can turn them off. Whether this display in a third-party app is acceptable has not been reviewed
by counsel (see `RISKS_AND_LIMITATIONS.md`).
