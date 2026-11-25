import { useShared } from "../store";

/** What Gossip Points buy. The original trades points for ocarina scores of the game's music; this app trades them for
 *  its own ocarinas instead (the music is Nintendo's). */
export interface Reward {
  id: string;
  kind: "ocarina";
  name: string;
  cost: number;
  art: string;
}

export const REWARDS: Reward[] = [
  { id: "ocarina-jade", kind: "ocarina", name: "Jade Ocarina", cost: 300, art: "ocarina_jade" },
  { id: "ocarina-gold", kind: "ocarina", name: "Gilded Ocarina", cost: 300, art: "ocarina_gold" },
];

/** Rewards the player has bought, and the points spent on them. */
export function useOwned(): [Record<string, true>, (id: string) => void, number] {
  const [owned, setOwned] = useShared<Record<string, true>>("rewards.owned", {});
  const spent = REWARDS.filter((r) => owned[r.id]).reduce((a, r) => a + r.cost, 0);
  return [owned, (id) => setOwned({ ...owned, [id]: true }), spent];
}

const ART = import.meta.glob<string>("../assets/rewards/*.webp", { eager: true, import: "default" });
/** A reward's picture (src/assets/rewards), if it has been added. */
export const rewardArt = (name: string): string | undefined => ART[`../assets/rewards/${name}.webp`];
