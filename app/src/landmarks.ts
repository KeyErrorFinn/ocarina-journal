import { invoke } from "./ipc";
import { useEffect, useState } from "react";
import type { Game } from "./model";

/** A landmark from the player's game maps (crates/oj-gamedata/src/rumors.rs): Rumor Hunt's rumours and map markers. */
export interface Landmark {
  id: string;
  kind: LandKind;
  area: string;
  pos: [number, number, number];
  eras: ("child" | "adult")[];
}
export type LandKind = "stone" | "grotto" | "cow" | "owl" | "scarecrow" | "frog" | "beehive";
export const LAND_KINDS: LandKind[] = ["stone", "grotto", "cow", "scarecrow", "frog", "owl", "beehive"];

/** Each kind's name, Rumor Hunt points and rumour line. The wording is this app's own. */
export const LANDMARK: Record<LandKind, { name: string; plural: string; points: number; said: string }> = {
  stone: { name: "Gossip Stone", plural: "Gossip Stones", points: 30, said: "a stone that hears every secret stands somewhere in" },
  grotto: { name: "Hidden Grotto", plural: "Hidden Grottos", points: 40, said: "a hidden hollow opens beneath the ground of" },
  cow: { name: "Cow", plural: "Cows", points: 20, said: "a cow waits patiently for a song in" },
  owl: { name: "Owl's Perch", plural: "Owl's Perches", points: 20, said: "a wise old owl likes to rest in" },
  scarecrow: { name: "Scarecrow's Spot", plural: "Scarecrow Spots", points: 30, said: "a scarecrow will remember your tune in" },
  frog: { name: "Singing Frog", plural: "Singing Frogs", points: 30, said: "a frog sings along to anything played in" },
  beehive: { name: "Beehive", plural: "Beehives", points: 20, said: "bees have made a hidden home in" },
};

let promise: Promise<Landmark[] | null> | null = null;

/** The landmarks; `undefined` while loading, `null` when the game folder cannot be read. */
export function loadLandmarks() {
  promise ??= invoke<Landmark[]>("get_rumors").catch(() => {
    promise = null;
    return null;
  });
  return promise;
}

export function useLandmarks(): Landmark[] | null | undefined {
  const [r, setR] = useState<Landmark[] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadLandmarks().then((x) => live && setR(x));
    return () => {
      live = false;
    };
  }, []);
  return r;
}

/** The live game's area ("KakarikoVillage_Adult_Alternative" -> "KakarikoVillage"). */
export const areaOf = (map: string | null | undefined) => map?.replace(/_Alternative$/, "").replace(/_(Child|Adult)$/, "") ?? null;

/** Horizontal distance from Link to a landmark, when he is in its area. */
export function distance(game: Game | null, r: Landmark): number | null {
  if (!game?.pos || areaOf(game.map) !== r.area) return null;
  return Math.hypot(game.pos[0] - r.pos[0], game.pos[2] - r.pos[2]);
}
