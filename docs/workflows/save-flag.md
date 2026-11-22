# Document and use a save flag

Saves (`progress.sav`) store values under the **murmur3 hash** of each flag's name (`oj_savefile::flag_hash`).
Names come from the game's own data; nothing here may be guessed and presented as fact.

1. **Find it.** The examples in `crates/oj-gamedata/examples/` help: `flagprobe` reads a save and prints flags by
   name or by word, `hashguess` tries candidate names against a hash, `bymldump` and `msgraw` show the game files
   that name flags. Compare a save from before and after the event (keep both outside the repository).
2. **Write it down** in `docs/research/GAME_STATE_AND_SAVE_FORMATS.md` (or `GAME_MAPS.md` for map things): the name,
   its type, what sets it, and a mark: **[V]** with how you checked it, **[I]** or **[U]**.
3. **Read it.** Top-level flags can be found with `GameData::find`. Members of a struct (such as
   `HavePlayedEvent.Npc_Dream_FirstTalk`) can't: read them with `sav.get(flag_hash("Struct.Member"))`.
   Treat a missing flag as unknown (`None`), not as false.
4. **Test it** with your install in PowerShell: `$env:OJ_TEST_GAME = "<folder>"; cargo test -p oj-gamedata`. Don't add the save to the
   repository; describe values in the test or the docs instead.
5. Say in the pull request which Longshot version and which save situation you checked.
