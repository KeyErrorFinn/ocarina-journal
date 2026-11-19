/** Original content for the app. Song note orders and trivia are facts about the game; the wording is ours. */

/** World layout: where each area sits on the app's own schematic Hyrule (0..100 each way). Not to scale. */
export const WORLD: Record<string, { x: number; y: number; r?: number }> = {
  DeathMountainCrater: { x: 78, y: 12 }, DeathMountainTrail: { x: 70, y: 22 }, GoronCity: { x: 84, y: 28 },
  FireTemple: { x: 88, y: 10 }, DodongoCavern: { x: 62, y: 20 }, Graveyard: { x: 42, y: 28 },
  KakarikoVillage: { x: 50, y: 34 }, ShadowTemple: { x: 36, y: 22 }, BottomOfTheWell: { x: 52, y: 44 },
  HyruleCastle: { x: 30, y: 38 }, Market: { x: 24, y: 44 }, GanonCastle: { x: 14, y: 36 }, InsideGanonCastle: { x: 8, y: 28 },
  HyruleField: { x: 40, y: 54 }, ZoraRiver: { x: 62, y: 40 }, ZoraDomain: { x: 74, y: 44 }, ZoraFountain: { x: 86, y: 46 },
  IceCavern: { x: 90, y: 56 }, LostWood: { x: 20, y: 70 }, KokiriForest: { x: 14, y: 84 }, SacredForestMeadow: { x: 8, y: 66 },
  ForestTemple: { x: 6, y: 56 }, InsideTheDekuTree: { x: 24, y: 88 }, InsideJabuJabuBelly: { x: 82, y: 58 },
  WaterTemple: { x: 62, y: 80 }, GerudoValley: { x: 30, y: 74 }, GerudoFortress: { x: 40, y: 82 },
  GerudoTrainingGround: { x: 50, y: 88 }, HountedWasteland: { x: 56, y: 70 }, DesertColossus: { x: 68, y: 92 }, SpiritTemple: { x: 80, y: 88 },
};

/** Ocarina notes. A = A button, then the four directions. */
export type Note = "A" | "D" | "R" | "L" | "U";
export const NOTE_PITCH: Record<Note, number> = { A: 293.66, D: 349.23, R: 440, L: 493.88, U: 587.33 };
export const NOTE_LABEL: Record<Note, string> = { A: "A", D: "▼", R: "▶", L: "◀", U: "▲" };

export const SONGS: Record<string, Note[]> = {
  "Zelda's Lullaby": ["L", "U", "R", "L", "U", "R"],
  "Epona's Song": ["U", "L", "R", "U", "L", "R"],
  "Saria's Song": ["D", "R", "L", "D", "R", "L"],
  "Sun's Song": ["R", "D", "U", "R", "D", "U"],
  "Song of Time": ["R", "A", "D", "R", "A", "D"],
  "Song of Storms": ["A", "D", "U", "A", "D", "U"],
  "Minuet of the Forest": ["A", "U", "L", "R", "L", "R"],
  "Bolero of Fire": ["D", "A", "D", "A", "R", "D", "R", "D"],
  "Serenade of Water": ["A", "D", "R", "R", "L"],
  "Requiem of Spirit": ["A", "D", "A", "R", "D", "A"],
  "Nocturne of Shadow": ["L", "R", "R", "A", "L", "R", "D"],
  "Prelude of Light": ["U", "R", "U", "R", "L", "U"],
};

export interface Q {
  q: string;
  a: [string, string, string, string];
  ok: number;
}
/** Original questions, easiest first. Each answer is a documented fact of the game. */
export const QUIZ: Q[] = [
  { q: "Who is Link's fairy companion at the start?", a: ["Tatl", "Navi", "Tael", "Saria"], ok: 1 },
  { q: "Where does Link grow up?", a: ["Kakariko Village", "Kokiri Forest", "Goron City", "Lon Lon Ranch"], ok: 1 },
  { q: "Which item opens the Door of Time?", a: ["Ocarina and the three Spiritual Stones", "Master Sword only", "Hookshot", "Megaton Hammer"], ok: 0 },
  { q: "Who is the princess of Hyrule?", a: ["Ruto", "Nabooru", "Zelda", "Impa"], ok: 2 },
  { q: "What does Link play to call his horse?", a: ["Epona's Song", "Sun's Song", "Song of Storms", "Saria's Song"], ok: 0 },
  { q: "Which boss waits in the Deku Tree?", a: ["Gohma", "Barinade", "Morpha", "Volvagia"], ok: 0 },
  { q: "What do you collect from Gold Skulltulas?", a: ["Hearts", "Tokens", "Bombs", "Fairies"], ok: 1 },
  { q: "Who rules the Gorons?", a: ["Darunia", "Dampe", "Talon", "Mido"], ok: 0 },
  { q: "Which song is played to make the sun rise or set?", a: ["Song of Time", "Sun's Song", "Prelude of Light", "Minuet of the Forest"], ok: 1 },
  { q: "What is the name of the Zora princess?", a: ["Ruto", "Saria", "Malon", "Fado"], ok: 0 },
  { q: "Which temple is entered from Kakariko's Graveyard?", a: ["Shadow Temple", "Fire Temple", "Water Temple", "Forest Temple"], ok: 0 },
  { q: "What does the Mask of Truth let you do?", a: ["Hear Gossip Stones", "Turn invisible", "Breathe underwater", "Stop time"], ok: 0 },
  { q: "Who gives Link the Ocarina of Time?", a: ["Zelda", "Saria", "Navi", "Darunia"], ok: 0 },
  { q: "Which tool lets Link reach far-off hooks and walls?", a: ["Hookshot", "Boomerang", "Bombchus", "Deku Nuts"], ok: 0 },
  { q: "Which sage is connected to the Forest Temple?", a: ["Saria", "Rauru", "Impa", "Nabooru"], ok: 0 },
  { q: "Where is the Temple of Time?", a: ["Hyrule Castle Town", "Zora's Domain", "Gerudo Valley", "Lost Woods"], ok: 0 },
  { q: "Which song warns of a coming storm and clears the rain?", a: ["Song of Storms", "Epona's Song", "Zelda's Lullaby", "Serenade of Water"], ok: 0 },
  { q: "What is found at the bottom of the well in Kakariko?", a: ["A dungeon", "A fairy fountain only", "A shop", "A boat"], ok: 0 },
  { q: "Which dungeon holds the Megaton Hammer?", a: ["Fire Temple", "Water Temple", "Ice Cavern", "Jabu-Jabu"], ok: 0 },
  { q: "What is the name of the Great Deku Tree's boss-spider?", a: ["Queen Gohma", "Dodongo", "Barinade", "Bongo Bongo"], ok: 0 },
];

export const MEDALS = [
  { id: "skull", name: "Token Collector", rule: "Earned by collecting Gold Skulltula tokens", cat: "skulltulas", tiers: [10, 30, 50, 100], glyph: "sword" },
  { id: "kills", name: "Foe Slayer", rule: "Earned by defeating enemies of any kind", cat: "kills", tiers: [100, 300, 500, 1000], glyph: "sword" },
  { id: "foes", name: "Foe Hunter", rule: "Earned by defeating different kinds of enemies", cat: "enemies", tiers: [20, 40, 60, 79], glyph: "sword" },
  { id: "chests", name: "Treasure Seeker", rule: "Earned by opening chests", cat: "chests", tiers: [25, 75, 125, 184], glyph: "gem" },
  { id: "hearts", name: "Big Hearted", rule: "Earned by growing your heart containers", cat: "hearts", tiers: [5, 10, 15, 20], glyph: "gem" },
  { id: "pieces", name: "Piece by Piece", rule: "Earned by finding Heart pieces", cat: "heart-pieces", tiers: [8, 16, 26, 36], glyph: "path" },
  { id: "songs", name: "Melody Keeper", rule: "Earned by learning songs", cat: "songs", tiers: [3, 6, 10, 13], glyph: "coin" },
  { id: "bosses", name: "Boss Breaker", rule: "Earned by defeating bosses", cat: "bosses", tiers: [2, 4, 7, 10], glyph: "sword" },
  { id: "story", name: "Storyteller", rule: "Earned by advancing the story", cat: "story", tiers: [4, 8, 14, 18], glyph: "hourglass" },
] as const;
export const TIER_NAMES = ["Bronze", "Silver", "Gold", "Master"] as const;
