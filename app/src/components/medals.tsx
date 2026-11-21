import { MedalBadge } from "./icons";
import { Ribbon } from "./art";

/** Medal art drawn for this app (src/assets/medals): metal bases per tier, an emblem per medal, Hall of Foes rosettes
 *  and the default profile picture. Anything missing falls back to the SVG drawings. */
const ART = import.meta.glob<string>("../assets/medals/*.webp", { eager: true, import: "default" });
const art = (name: string): string | undefined => ART[`../assets/medals/${name}.webp`];

export type Tier = "bronze" | "silver" | "gold" | "locked";
const TIERS: Tier[] = ["locked", "bronze", "silver", "gold"];

export const PORTRAIT = art("portrait");

/** A My Journey medal: the tier's shield with the medal's emblem on it. */
export function Medal({ id, tier, glyph }: { id: string; tier: Tier; glyph: string }) {
  const base = art(`shield_${tier}`), emblem = art(`emblem_${id}`);
  if (!base || !emblem) return <MedalBadge tier={tier} glyph={tier === "locked" ? "?" : glyph} />;
  return (
    <span className="medal-art">
      <img src={base} alt="" />
      {tier !== "locked" && <img className="emblem" src={emblem} alt="" />}
    </span>
  );
}

/** A Hall of Foes rosette; `tier` 0 is not yet defeated. */
export function Rosette({ tier }: { tier: number }) {
  const src = art(`rosette_${TIERS[Math.min(tier, 3)]}`);
  return src ? <img className="rosette" src={src} alt="" /> : <Ribbon tier={tier} />;
}
