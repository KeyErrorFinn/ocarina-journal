# Fix or polish a screen

1. Each screen is one file in `app/src/screens/`; shared pieces are in `app/src/components/` (`chrome.tsx` has the
   header band, tabs, sheets and segmented controls). Styles are in `app/src/styles.css`, grouped by screen.
2. Reuse what is there: the colour variables at the top of `styles.css`, `--body` and `--display` fonts, `.card`,
   `.pillbtn`, `.btn`, `Sheet`, `Tabs`. Don't add a UI library.
3. The window resizes freely. Check a narrow window (about 450 px wide), a wide one (1280 px or more) and a short
   one (about 560 px tall). Pages of text keep the centred column (`--col`); maps fill the window.
4. Check with no game running, with saves only, and if you can with the live bridge on.
5. `pnpm check`, then screenshots of before and after in the pull request. Use the no-game state or synthetic
   data so no game-derived maps, text, textures or personal details appear in shared screenshots.
