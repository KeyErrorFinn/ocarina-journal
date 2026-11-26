/** Magic bean soft soil and the ride that grows from it, read by the backend from the player's game folder (see
 *  crates/oj-gamedata/src/beans.rs). Positions are in the area's metres, like the other map entries. */
import { useEffect, useState } from "react";
import { invoke } from "./ipc";
import { prettyArea, type Vec3 } from "./report";

export interface BeanSpot {
  /** The spot's name in the game's flag: `ZoraRiver02`, `LakeHylia`, `LostWood01`. */
  id: string;
  /** The area folder the soil is placed in (Lake Hylia's soil is in `HyruleField`; find its picture with `placeAt`). */
  area: string;
  pos: Vec3;
  /** The ride's route, a closed line of points. */
  path: Vec3[];
  /** Where the ride lets Link off. */
  stops: Vec3[];
  /** The route's length in metres. */
  length: number;
}

let promise: Promise<BeanSpot[] | null> | null = null;

/** Starts reading the spots (a second screen asks for them as soon as the page is up). */
export function loadBeans() {
  promise ??= invoke<BeanSpot[]>("get_bean_soil").catch(() => {
    promise = null;
    return null;
  });
  return promise;
}

/** The spots; `undefined` while loading, `null` when the game folder cannot be read. */
export function useBeanSoil(): BeanSpot[] | null | undefined {
  const [spots, setSpots] = useState<BeanSpot[] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadBeans().then((s) => live && setSpots(s));
    return () => {
      live = false;
    };
  }, []);
  return spots;
}

/** "Zora River", or "Lost Woods 2" where an area holds more than one spot. */
export function beanName(spot: BeanSpot, all: BeanSpot[]): string {
  const base = spot.id.replace(/\d+$/, "");
  const n = /(\d+)$/.exec(spot.id)?.[1];
  const same = all.filter((s) => s.id.replace(/\d+$/, "") === base).length;
  return same > 1 && n ? `${prettyArea(base)} ${Number(n)}` : prettyArea(base);
}

/** Arrowheads along a ride's route, pointing the way it goes (the route is in riding order: the ride starts at the soil).
 *  `proj` puts a position on the picture (percentages) and `aspect` is the picture's height over its width, so the angle is
 *  right on screen however the picture is stretched. */
export function rideArrows(
  path: Vec3[],
  proj: (x: number, z: number) => { left: number; top: number },
  aspect: number,
): { left: number; top: number; deg: number }[] {
  if (path.length < 2) return [];
  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
  const total = along[along.length - 1];
  if (!(total > 0)) return [];
  const at = (d: number): [number, number] => {
    const t = Math.min(Math.max(d, 0), total);
    let i = 1;
    while (i < path.length - 1 && along[i] < t) i++;
    const span = along[i] - along[i - 1] || 1;
    const f = (t - along[i - 1]) / span;
    return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][2] + (path[i][2] - path[i - 1][2]) * f];
  };
  const n = Math.min(14, Math.max(5, Math.round(total / 45)));
  const step = Math.min(3, total / 100);
  return Array.from({ length: n }, (_, k) => {
    const d = ((k + 0.5) / n) * total;
    const [x, z] = at(d);
    const a = proj(...at(d - step));
    const b = proj(...at(d + step));
    const here = proj(x, z);
    return { left: here.left, top: here.top, deg: (Math.atan2((b.top - a.top) * aspect, b.left - a.left) * 180) / Math.PI };
  });
}
