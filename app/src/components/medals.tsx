import { MedalBadge } from "./icons";
import { Ribbon } from "./art";

/** Medal art drawn for this app (src/assets/medals): metal bases per tier, an emblem per medal, Hall of Foes rosettes
 *  and the default profile picture. Anything missing falls back to the SVG drawings. */
const ART = import.meta.glob<string>("../assets/medals/*.webp", { eager: true, import: "default" });
const art = (name: string): string | undefined => ART[`../assets/medals/${name}.webp`];

export type Tier = "bronze" | "silver" | "gold" | "master" | "locked";
const TIERS = ["locked", "bronze", "silver", "gold"] as const;

export const PORTRAIT = art("portrait");

/** A My Journey medal: the tier's shield with the medal's emblem on it. */
export function Medal({ id, tier, glyph }: { id: string; tier: Tier; glyph: string }) {
  // Master (the fourth tier) is the gold shield with a glow.
  const metal = tier === "master" ? "gold" : tier;
  const base = art(`shield_${metal}`),
    emblem = art(`emblem_${id}`);
  if (!base || !emblem)
    return (
      <span className={tier === "master" ? "master" : undefined}>
        <MedalBadge tier={metal} glyph={tier === "locked" ? "?" : glyph} />
      </span>
    );
  return (
    <span className={`medal-art ${tier === "master" ? "master" : ""}`}>
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
