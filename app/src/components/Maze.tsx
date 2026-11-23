import { useId } from "react";
import type { MapPlace, MapWalk } from "../maps";

/** The Lost Woods maze, drawn over the game's foliage picture (which has no paths of its own). The shapes are the
 *  game's own walkable volumes for the maze floor, read from the player's files; the look (a gold path with a dark
 *  rim, softened where the volumes meet) is this app's own. `seen` limits it to the volumes Link has walked through. */
export function Maze({ walk, place, aspect, seen }: { walk: MapWalk[]; place: MapPlace; aspect: number; seen: ReadonlySet<number> | null }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = 1000,
    H = 1000 * aspect,
    sc = W / place.span;
  const at = (x: number) => W / 2 + (x - place.center[0]) * sc;
  const down = (z: number) => H / 2 + (z - place.center[1]) * sc;
  // The game's volumes along a corridor leave gaps of a few metres; join the ones that line up (same row or column,
  // close together) so a corridor reads as one path. Rooms are covered by their own volumes and need no joining.
  const chosen = walk.map((w, i) => ({ w, i })).filter(({ i }) => !seen || seen.has(i));
  const joins: [number, number][] = [];
  // Volumes that touch (their bounding circles overlap) or line up are one piece; `parent` is a union-find over them.
  const parent = chosen.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  for (let a = 0; a < chosen.length; a++)
    for (let b = a + 1; b < chosen.length; b++) {
      const p = chosen[a].w,
        q = chosen[b].w,
        dx = Math.abs(p.x - q.x),
        dz = Math.abs(p.z - q.z);
      const lined = (dx <= 1.5 && dz <= 14) || (dz <= 1.5 && dx <= 14);
      if (lined) joins.push([a, b]);
      if (lined || Math.hypot(dx, dz) <= Math.hypot(p.w, p.d) / 2 + Math.hypot(q.w, q.d) / 2) parent[root(a)] = root(b);
    }
  // A lone small volume with nothing joined to it is a trigger spot, not a path: leave it off the map. (When only the
  // explored part is drawn, a path just begun is a single volume, so everything walked through stays.)
  const size = new Map<number, number>();
  chosen.forEach((_, k) => size.set(root(k), (size.get(root(k)) ?? 0) + 1));
  const keep = chosen.map(({ w }, k) => !!seen || (size.get(root(k)) ?? 0) >= 3 || w.w * w.d >= 150);
  const shown = chosen.filter((_, k) => keep[k]);
  const lines = joins.filter(([a, b]) => keep[a] && keep[b]);
  return (
    <svg className="maze" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        {/* Blur the shapes together and cut the result hard again: gaps of a few metres close and corners round off. */}
        <filter id={`soft${id}`} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={sc * 1.4} />
          <feComponentTransfer>
            <feFuncA type="linear" slope="22" intercept="-9" />
          </feComponentTransfer>
        </filter>
        <g id={`boxes${id}`}>
          {shown.map(({ w, i }) => (
            <rect
              key={i}
              x={-w.w * sc * 0.5}
              y={-w.d * sc * 0.5}
              width={w.w * sc}
              height={w.d * sc}
              transform={`translate(${at(w.x)} ${down(w.z)}) rotate(${w.r})`}
            />
          ))}
          {lines.map(([a, b]) => (
            <line key={`j${a}-${b}`} x1={at(chosen[a].w.x)} y1={down(chosen[a].w.z)} x2={at(chosen[b].w.x)} y2={down(chosen[b].w.z)} />
          ))}
        </g>
      </defs>
      <g filter={`url(#soft${id})`} className="maze-rim">
        <use href={`#boxes${id}`} strokeWidth={sc * 6.6} />
      </g>
      <g filter={`url(#soft${id})`} className="maze-floor">
        <use href={`#boxes${id}`} strokeWidth={sc * 3.6} />
      </g>
    </svg>
  );
}
