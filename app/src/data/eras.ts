/** The age an item belongs to, for the few the game's own placement files don't say (they sit in a map file shared by both
 *  ages, so the app reads them as "unspecified" and says nothing about switching age). Keyed by the item's id (the `id` of its
 *  entry in the save report). Only what has been confirmed in play goes here. */
export const ERAS: Record<string, ("child" | "adult")[]> = {
  // Hyrule Castle: under the soil that opens with the Song of Storms, as Child Link
  "skulltulas/HyruleCastle/2": ["child"],
};
