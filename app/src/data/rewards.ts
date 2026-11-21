import { useLocal } from "../store";

/** What Gossip Points buy. The original trades points for ocarina scores of the game's music; this app trades them for
 *  its own ocarinas, photo frames and sticker sets instead (the music is Nintendo's). */
export interface Reward { id: string; kind: "ocarina" | "frame" | "stickers"; name: string; cost: number; art: string }

export const REWARDS: Reward[] = [
  { id: "ocarina-jade", kind: "ocarina", name: "Jade Ocarina", cost: 300, art: "ocarina_jade" },
  { id: "ocarina-gold", kind: "ocarina", name: "Gilded Ocarina", cost: 300, art: "ocarina_gold" },
  { id: "frame-vines", kind: "frame", name: "Vine Frame", cost: 300, art: "frame_vines" },
  { id: "frame-ember", kind: "frame", name: "Ember Frame", cost: 300, art: "frame_ember" },
  { id: "frame-tide", kind: "frame", name: "Tide Frame", cost: 300, art: "frame_tide" },
  { id: "frame-night", kind: "frame", name: "Night Frame", cost: 300, art: "frame_night" },
  { id: "stickers-forest", kind: "stickers", name: "Forest Stickers", cost: 300, art: "sticker_forest_mushroom" },
  { id: "stickers-sky", kind: "stickers", name: "Sky Stickers", cost: 300, art: "sticker_sky_moon" },
];

/** Rewards the player has bought, and the points spent on them. */
export function useOwned(): [Record<string, true>, (id: string) => void, number] {
  const [owned, setOwned] = useLocal<Record<string, true>>("rewards.owned", {});
  const spent = REWARDS.filter((r) => owned[r.id]).reduce((a, r) => a + r.cost, 0);
  return [owned, (id) => setOwned({ ...owned, [id]: true }), spent];
}

const ART = import.meta.glob<string>("../assets/rewards/*.webp", { eager: true, import: "default" });
/** A reward's picture (src/assets/rewards), if it has been added. */
export const rewardArt = (name: string): string | undefined => ART[`../assets/rewards/${name}.webp`];
