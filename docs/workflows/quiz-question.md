# Add a quiz question

Written questions live in `app/src/data/content.ts`, in `QUIZ`, easiest first. (Most questions in a game are made
at runtime from the player's own game text; those need no change here.)

1. Add an entry in the right place by difficulty:
   ```ts
   { q: "Which song warns of a coming storm?", a: ["Song of Storms", "Sun's Song", "Epona's Song", "Saria's Song"], ok: 0 },
   ```
   `a` has exactly four answers and `ok` is the index of the right one.
2. The answer must be a documented fact of the game, written in your own words. Don't copy text from the game,
   a guide or the original app.
3. Avoid trick questions and answers that differ by one word; mix the position of the right answer.
4. Check: `pnpm check` in `app/`, then play the Egg Level in `pnpm tauri dev` until your question comes up.
