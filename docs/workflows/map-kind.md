# Add a kind of collectible to the map

The map shows report categories that have positions: today `chests`, `skulltulas`, `heart-pieces` and
`heart-containers`.

1. **Rust:** the category must exist in `crates/oj-gamedata/src/lib.rs` (the `(id, title)` list) and its entries
   must carry an `area` and a `pos`. Check with `OJ_TEST_GAME` that positions land on the right map.
2. **App:** add the id to `MAP_KINDS` and `KIND_NAME` in `app/src/report.ts`, a default in `MAP_DEFAULTS.kinds` in
   `app/src/screens/MapScreen.tsx`, and a singular/plural name where the map lists kinds.
3. **Marker art:** `app/src/assets/markers/mk_<name>.webp` and `mk_<name>_done.webp`, mapped in `MARK_OF` in
   `app/src/components/art.tsx`. It must read at 2 em on the parchment map. Without art a drawn fallback shows.
4. **Check** the world map's hover card, an area map, the filters sheet and Area Completion.
