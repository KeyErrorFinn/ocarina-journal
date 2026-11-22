# Add a medal

Medals are defined in `MEDALS` in `app/src/data/content.ts` and drawn by `app/src/components/medals.tsx`.

1. Add an entry:
   ```ts
   { id: "melodies", name: "Melody Keeper", rule: "Earned by learning songs", cat: "songs", tiers: [3, 6, 9, 12], glyph: "path" },
   ```
   - Use an id that isn't already in `MEDALS`; the example illustrates the shape, not a request to add a duplicate song medal.
   - `cat` is a report category id from `crates/oj-gamedata/src/lib.rs` (the list of `(id, title)` pairs:
     `chests`, `skulltulas`, `heart-pieces`, `songs`, `bosses`, `enemies`, ...) or the special `kills` (every enemy
     defeated, summed). The medal's value is that category's `have` count.
   - `tiers` are the counts for bronze, silver, gold and master. The original app's thresholds aren't in the game's
     files, so these are this app's own choice; keep the last one reachable (at most the category's total).
2. Optional art: `app/src/assets/medals/emblem_<id>.webp`, original, about 256 px, transparent background. Without
   it the medal shows its `glyph`.
3. Check: `pnpm check`, then open My Journey with a save that has some of that category.
