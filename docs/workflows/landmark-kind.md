# Add a kind of Rumor Hunt landmark

Landmarks are actors placed in the game's field maps, read at runtime by `crates/oj-gamedata/src/rumors.rs`.

1. **Rust:** add the actor's name pattern to `kind_of` in `rumors.rs`, returning a short kind id. Check the
   pattern against your own game with `cargo run -p oj-gamedata --example actorcensus -- "<game folder>"`
   (counts actor types, showing one example map and position per type; keep its output outside the repository).
   If one spot holds several actors of the kind, the 8 m merge already makes them one place; check the count.
2. **Test:** update the kinds listed in `finds_landmarks_for_rumours` in `crates/oj-gamedata/tests/maps.rs` and run it
   with `OJ_TEST_GAME`.
3. **App:** add the kind to `LandKind`, `LAND_KINDS` and `LANDMARK` in `app/src/landmarks.ts` (name, plural,
   points and the rumour's wording, in your own words), and its default in `MAP_DEFAULTS.marks` in
   `app/src/screens/MapScreen.tsx`.
4. **Art (optional):** a map marker `app/src/assets/markers/mk_<name>.webp` and `mk_<name>_done.webp`, mapped in
   `MARK_OF` in `app/src/components/art.tsx`, and a card `app/src/assets/rumors/card_<kind>.webp`. Original art only.
5. **Docs:** the landmark list and count in `docs/research/GAME_MAPS.md`.
