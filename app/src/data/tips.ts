/** Hand-written tips for map items, shown behind the spoiler button, keyed by the item's id (the `id` of its entry in
 *  the save report). Write them in your own words; don't copy a guide or the game's text. A tip is one line, or a list
 *  of titled lines. A tip is optional: items without one still show what the game's own files say. See CONTRIBUTING.md. */
export type Tip = string | { title: string; text: string }[];

/** The fairy notes in Hyrule Field are only there as Adult Link and mention things Child Link can do (the game's own
 *  files place each note, the locked chest and the scrub, and name the password). */
const HF_CHEST: Tip = [
  {
    title: "Why it won't open",
    text: "It is locked, and there is no key for it anywhere in Hyrule Field.",
  },
  {
    title: "How to get it",
    text: "Read the fairy's note lying right beside the chest as Adult Link: it says the lock was left undone. Travel back to the past and open the chest as Child Link.",
  },
];

export const TIPS: Record<string, Tip> = {
  "skulltulas/HyruleCastle/2": [{ title: "Child Link only", text: "It is buried under soil that opens when you play the Song of Storms there as Child Link." }],
  "chests/HyruleField/2": HF_CHEST,
  // the same chest, counted again as a Piece of Heart
  "heart-pieces/HyruleField/2": HF_CHEST,
  "heart-pieces/HyruleField/4": [
    {
      title: "What you need",
      text: "A Business Scrub in a grotto here only sells to someone who knows his password. Child Link buys the Piece of Heart from him.",
    },
    {
      title: "The password",
      text: "A fairy's note about 13 m north-east of the grotto entrance, which is there as Adult Link, gives it: “Sell somethin', will ya?”. The note says “Ya makin' money?” and “Not too shabby!” don't work. Go back to the past as Child Link and tell the scrub.",
    },
  ],
};
