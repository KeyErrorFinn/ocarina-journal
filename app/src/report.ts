/** The save report: every collectible with its name, area and position. Made outside the app from the
 *  player's own game files (never shipped); the app only reads it. */
export interface RepEntry {
  id: string;
  label: string;
  area: string;
  have: number;
  of: number;
  note: string | null;
  /** Times defeated (enemies and bosses). */
  count?: number;
}
export interface RepCategory {
  id: string;
  title: string;
  counted: boolean;
  have: number;
  of: number;
  entries: RepEntry[];
}
export interface RepSlot {
  slot: string;
  number: number;
  place: { area: string; name: string } | null;
  age: string | null;
  hearts: number | null;
  rupees: number | null;
  clock: string | null;
  saved: string | null;
  totals: Record<string, [number, number]>;
}
export interface RepHall {
  id: string;
  label: string;
  recorded: boolean;
  /** The game's BestTimeFrame float. The unit is unverified (see HALL_FPS). */
  best_frames: number | null;
  other: number | null;
}

/** Frames per second assumed for BestTimeFrame. **Unverified**: no save on hand held a record to check. */
export const HALL_FPS = 60;

export function hallTime(h: RepHall | undefined): string | null {
  if (!h?.recorded || h.best_frames == null || !(h.best_frames > 0)) return null;
  const t = h.best_frames / HALL_FPS;
  const m = Math.floor(t / 60);
  return `${String(m).padStart(2, "0")}:${(t - m * 60).toFixed(2).padStart(5, "0")}`;
}

export interface Report {
  schema: number;
  game_revision: number;
  slot: string;
  slots: RepSlot[];
  categories: RepCategory[];
  hall?: RepHall[];
}
export interface ReportFile {
  modified_ms: number;
  report: Report;
}

export const MAP_KINDS = ["chests", "skulltulas", "heart-pieces", "heart-containers"] as const;
export type MapKind = (typeof MAP_KINDS)[number];

export const KIND_NAME: Record<MapKind, string> = {
  chests: "Chests",
  skulltulas: "Gold Skulltulas",
  "heart-pieces": "Heart pieces",
  "heart-containers": "Heart containers",
};

/** All enemies and bosses defeated, from the game's own per-enemy counters. */
export const totalKills = (r: Report | null): number =>
  ["enemies", "bosses"].reduce((a, c) => a + (r?.categories.find((x) => x.id === c)?.entries.reduce((b, e) => b + (e.count ?? 0), 0) ?? 0), 0);

export const cat = (r: Report | null, id: string): RepCategory | undefined => r?.categories.find((c) => c.id === id);

/** "InsideTheDekuTree" -> "Inside The Deku Tree". */
export function prettyArea(id: string): string {
  const fixed: Record<string, string> = { HountedWasteland: "Haunted Wasteland", LostWood: "Lost Woods", GanonCastle: "Ganon's Castle", InsideGanonCastle: "Inside Ganon's Castle" };
  return fixed[id] ?? id.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export type Vec3 = [number, number, number];

/** A position written in the entry's note or label ("room 1 at -0, 96, -5", "(at -3, 128, 49)"). */
export function coords(e: RepEntry): Vec3 | null {
  const m = /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(`${e.note ?? ""} ${e.label}`);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export interface AreaRow {
  area: string;
  kinds: Partial<Record<MapKind, [number, number]>>;
  have: number;
  of: number;
}

export function areaRows(r: Report | null): AreaRow[] {
  const rows = new Map<string, AreaRow>();
  for (const k of MAP_KINDS) {
    for (const e of cat(r, k)?.entries ?? []) {
      if (!e.area) continue;
      const row = rows.get(e.area) ?? { area: e.area, kinds: {}, have: 0, of: 0 };
      const t = (row.kinds[k] ??= [0, 0]);
      t[0] += e.have;
      t[1] += e.of;
      row.have += e.have;
      row.of += e.of;
      rows.set(e.area, row);
    }
  }
  return [...rows.values()];
}

export const pct = (have: number, of: number) => (of ? Math.round((100 * have) / of) : 0);

/** Overall completion over the four map kinds. The weighting is this app's, not the game's. */
export function overall(r: Report | null): number {
  const rows = areaRows(r);
  return pct(rows.reduce((a, x) => a + x.have, 0), rows.reduce((a, x) => a + x.of, 0));
}

export function entriesFor(r: Report | null, area: string, kinds: readonly MapKind[] = MAP_KINDS) {
  const out: (RepEntry & { kind: MapKind; pos: Vec3 | null })[] = [];
  for (const k of kinds) for (const e of cat(r, k)?.entries ?? []) if (e.area === area) out.push({ ...e, kind: k, pos: coords(e) });
  return out;
}
