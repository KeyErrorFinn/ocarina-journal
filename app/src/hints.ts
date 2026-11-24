/** Spoilers for a map item: what can be said about reaching it from facts in the player's own game files (where it sits,
 *  what a chest holds, what the game calls it), plus any tip someone wrote by hand in data/tips.ts. Nothing here is
 *  guessed beyond the plain reading of those facts, and nothing is shown until the player asks for it. */
import { TIPS } from "./data/tips";
import type { MapKind, RepEntry } from "./report";

export interface Hint {
  title: string;
  text: string;
}

export interface Near {
  /** "the way to Hyrule Field", "a Gossip Stone" */
  name: string;
  x: number;
  z: number;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** A compass bearing from one point to another on the map (north is up, which is -Z; east is +X). */
export function bearing(dx: number, dz: number): string {
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return COMPASS[(Math.round(((deg + 360) % 360) / 45) + 8) % 8];
}

/** The last bracketed part of an entry's label: what a chest holds, or the game's own name for the thing. */
export function bracketed(label: string): string | null {
  const m = label.match(/\(([^()]+)\)\s*$/);
  return m ? m[1] : null;
}

/** Plain words the game's own name can carry. These are readings of the name, not facts the game states. */
const NAME_WORDS: [RegExp, string][] = [
  [/scrub[ _]?business/i, "a Business Scrub"],
  [/\bgrotto\b/i, "a grotto"],
  [/\bfishing\b/i, "the fishing pond"],
  [/\bbean/i, "a magic bean spot"],
  [/\bfairy\b/i, "a fairy"],
  [/\bcow\b/i, "a cow"],
  [/\brace\b/i, "a race"],
  [/\barchery\b/i, "archery"],
  [/\bbombchu\b/i, "Bombchus"],
];

/** Chest contents the label spells with a code instead of words are left as they are. */
const looksLikeCoordinates = (t: string) => /^at -?\d/.test(t) || /^-?\d/.test(t);

export function hintsFor(e: RepEntry, kind: MapKind, here: { x: number; z: number } | null, near: Near[]): Hint[] {
  const out: Hint[] = [];
  const tip = TIPS[e.id];
  if (tip) out.push({ title: "Tip", text: tip });

  const inside = bracketed(e.label);
  if (kind === "chests" && inside && !looksLikeCoordinates(inside)) out.push({ title: "Inside", text: inside });
  if (kind !== "chests" && inside && !looksLikeCoordinates(inside)) {
    const words = NAME_WORDS.filter(([re]) => re.test(inside)).map(([, w]) => w);
    out.push({
      title: "The game's name for it",
      text: `“${inside.replace(/^.*? (Enemy|Treasure|Heart Piece|Heart piece) /i, "$1 ").trim()}”${words.length ? `, which points to ${words.join(" and ")}` : ""}.`,
    });
  }

  if (here && near.length) {
    const n = near.reduce((best, c) => (Math.hypot(c.x - here.x, c.z - here.z) < Math.hypot(best.x - here.x, best.z - here.z) ? c : best));
    const dx = here.x - n.x,
      dz = here.z - n.z,
      m = Math.round(Math.hypot(dx, dz));
    out.push({ title: "Where exactly", text: m < 4 ? `Right by ${n.name}.` : `About ${m} m ${bearing(dx, dz)} of ${n.name}.` });
  }
  return out;
}
