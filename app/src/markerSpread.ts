/** Map markers that land on the same spot (a chest and the Piece of Heart in it, two Gold Skulltulas in one tree) or close
 *  enough to cover each other are set side by side instead of piled up. How close counts depends on the zoom: markers
 *  have a fixed size on screen while the picture grows, so zooming in pulls them apart and they un-group by themselves. */

export interface Spot {
  key: string;
  /** Position as a percentage of the picture's width and height, like the markers' own `left` and `top`. */
  left: number;
  top: number;
}

export interface Spread {
  /** How far to move each grouped marker from where it is, in em, to sit in a row on the group's centre (markers on their
   *  own are not in the map). */
  shift: Map<string, { dx: number; dy: number }>;
  /** One entry per group: where it sits (its centre) and how many markers it holds. */
  groups: { left: number; top: number; n: number }[];
}

/** Markers closer than this many em (centre to centre) are grouped. A marker is about two em wide. */
export const GROUP_WITHIN = 1.9;
/** Distance between neighbours in a group, in em. */
export const GROUP_STEP = 2.05;

/** `px` is the picture's width on screen in pixels, `aspect` its height over its width and `em` the size of an em in pixels. */
export function spreadMarkers(spots: Spot[], px: number, aspect: number, em: number): Spread {
  const parent = spots.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reach = GROUP_WITHIN * em;
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const dx = ((spots[i].left - spots[j].left) / 100) * px;
      const dy = ((spots[i].top - spots[j].top) / 100) * px * aspect;
      if (Math.hypot(dx, dy) < reach) parent[find(i)] = find(j);
    }
  }
  const members = new Map<number, Spot[]>();
  spots.forEach((s, i) => members.set(find(i), [...(members.get(find(i)) ?? []), s]));
  const out: Spread = { shift: new Map(), groups: [] };
  for (const group of members.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const left = group.reduce((a, s) => a + s.left, 0) / group.length;
    const top = group.reduce((a, s) => a + s.top, 0) / group.length;
    group.forEach((s, i) =>
      out.shift.set(s.key, {
        dx: ((left - s.left) / 100) * (px / em) + (i - (group.length - 1) / 2) * GROUP_STEP,
        dy: ((top - s.top) / 100) * (px / em) * aspect,
      }),
    );
    out.groups.push({ left, top, n: group.length });
  }
  return out;
}

/** The size of an em in pixels where the map is drawn (the app's text size follows the window, see `.phone`). */
export function emPx(): number {
  if (typeof document === "undefined") return 15;
  const el = document.querySelector(".phone") ?? document.body;
  return parseFloat(getComputedStyle(el).fontSize) || 15;
}
