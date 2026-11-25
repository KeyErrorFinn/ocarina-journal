/** The game's own maps, read by the backend from the player's game folder (see crates/oj-gamedata/src/maps.rs).
 *  Pictures are fetched as bytes and shown from object URLs; nothing from the game ships with the app. */
import { invoke } from "./ipc";
import { useEffect, useState } from "react";
import type { Report, RepEntry, Vec3 } from "./report";
import { coords } from "./report";

export interface MapExit {
  to: string;
  x: number;
  z: number;
}
export interface MapMask {
  width: number;
  height: number;
  bits: string;
}
/** One walkable volume (the Lost Woods maze): centre, size along its own axes, and its turn in degrees. */
export interface MapWalk {
  x: number;
  z: number;
  w: number;
  d: number;
  r: number;
}
export interface MapEra {
  image: string;
  exits: MapExit[];
  /** Only for places whose picture draws no paths. */
  walk?: MapWalk[];
  mask: MapMask | null;
}
export interface MapFloor {
  name: string;
  y: number;
  image: string | null;
}
export interface MapPlace {
  center: [number, number];
  /** Metres across the picture's width. */
  span: number;
  dungeon: boolean;
  child: MapEra | null;
  adult: MapEra | null;
  floors: MapFloor[];
  /** The place whose Banc holds this one's things (Lake Hylia, Lon Lon Ranch: Hyrule Field). */
  within: string | null;
}
export interface MapIndex {
  world: { image: string; width: number; height: number; labels: Record<string, [number, number]> };
  places: Record<string, MapPlace>;
}

let indexPromise: Promise<MapIndex | null> | null = null;
/** The index once read (undefined while it hasn't been yet), so screens opened later have it from their first frame. */
let loadedIndex: MapIndex | null | undefined;

export function loadIndex() {
  indexPromise ??= invoke<MapIndex>("get_map_index")
    .then((i) => (loadedIndex = i))
    .catch(() => {
      indexPromise = null;
      return (loadedIndex = null);
    });
  return indexPromise;
}

export function useMapIndex(): MapIndex | null {
  const [idx, setIdx] = useState<MapIndex | null>(loadedIndex ?? null);
  useEffect(() => {
    let live = true;
    loadIndex().then((i) => live && setIdx(i));
    return () => {
      live = false;
    };
  }, []);
  return idx;
}

/** True until the first attempt to read the map index has finished (so screens can wait instead of showing a stand-in). */
export function useMapIndexPending(): boolean {
  const [pending, setPending] = useState(loadedIndex === undefined);
  useEffect(() => {
    let live = true;
    loadIndex().finally(() => live && setPending(false));
    return () => {
      live = false;
    };
  }, []);
  return pending;
}

type MapImage = { url: string; w: number; h: number; decoded: HTMLImageElement };
const sources = new Map<string, Promise<string>>();
const urls = new Map<string, Promise<MapImage>>();
/** Pictures already decoded: returned on the first render, so switching back to one never flashes. */
const loaded = new Map<string, MapImage>();
let foregroundImages = 0;
let backgroundReads = 0;
const backgroundQueue: { name: string; done: () => void }[] = [];

function drainBackground() {
  // Existing transfers can finish; stop starting more until the chosen view has also finished decoding.
  if (foregroundImages) return;
  while (backgroundReads < 2 && backgroundQueue.length) {
    const task = backgroundQueue.shift()!;
    backgroundReads++;
    void loadSource(task.name)
      .catch(() => {})
      .finally(() => {
        backgroundReads--;
        task.done();
        drainBackground();
      });
  }
}

function warmSources(names: string[]): Promise<void> {
  const finished = Promise.all(names.map((name) => new Promise<void>((done) => backgroundQueue.push({ name, done }))));
  drainBackground();
  return finished.then(() => {});
}

/** Cache encoded bytes separately: decoding every map at once can consume hundreds of megabytes on a phone. */
function loadSource(name: string): Promise<string> {
  let source = sources.get(name);
  if (!source) {
    source = invoke<ArrayBuffer>("get_map_image", { name }).then((buf) =>
      URL.createObjectURL(new Blob([buf], { type: name === "world" || name.startsWith("tapestry/") ? "image/jpeg" : "image/png" })),
    );
    sources.set(name, source);
    void source.catch(() => sources.delete(name));
  }
  return source;
}

function loadImage(name: string): Promise<MapImage> {
  let p = urls.get(name);
  if (!p) {
    // A chosen image starts immediately, sharing any existing download for that name. Background work resumes
    // only once it is ready to display, so newly queued maps cannot compete during the transition.
    foregroundImages++;
    p = loadSource(name)
      .then(
        (url) =>
          new Promise<MapImage>((ok, bad) => {
            const i = new Image();
            i.onload = () => i.decode().then(() => ok({ url, w: i.naturalWidth, h: i.naturalHeight, decoded: i }), bad);
            i.onerror = bad;
            i.src = url;
          }),
      )
      .then((image) => {
        loaded.set(name, image);
        // Keep a few decoded views for back-and-forth navigation, and all encoded sources for the session.
        while (loaded.size > 8) {
          const oldest = loaded.keys().next().value!;
          loaded.delete(oldest);
          urls.delete(oldest);
        }
        return image;
      })
      .finally(() => {
        foregroundImages--;
        drainBackground();
      });
    void p.catch(() => urls.delete(name));
    urls.set(name, p);
  }
  return p;
}

export const isMapImageReady = (name: string | null | undefined): boolean => !name || loaded.has(name);
/** Finish decoding a destination before changing the visible map. */
export const prepareMapImage = (name: string): Promise<MapImage> => loadImage(name);

/** Fetch likely neighbours without decoding them all into phone memory. */
export function preloadMapSources(names: (string | null | undefined)[]) {
  void warmSources(names.filter((name): name is string => !!name));
}

/** Prepare a few pictures that will be displayed together (the world map or tapestry). */
export function preloadMapImages(names: (string | null | undefined)[]) {
  for (const n of names) if (n) loadImage(n).catch(() => {});
}

let warming: Promise<void> | null = null;
function mapImageNames(idx: MapIndex): string[] {
  const names = new Set<string>([idx.world.image]);
  for (const p of Object.values(idx.places)) {
    if (p.child) names.add(p.child.image);
    if (p.adult) names.add(p.adult.image);
    for (const f of p.floors) if (f.image) names.add(f.image);
  }
  return [...names];
}

/** Fetch every era and dungeon floor in the background. Leave decoding to the visible destination so Map opens
 * promptly and phone memory stays bounded. Reopening Map retries failed sources. */
export function preloadAllMapImages(idx: MapIndex): Promise<void> {
  if (warming) return warming;
  warming = warmSources(mapImageNames(idx)).then(() => {
    warming = null;
  });
  return warming;
}

/** An object URL for one map picture, with its natural size once loaded. Never returns a different picture than the
 *  one asked for, so a screen doesn't briefly show the previous map. */
export function useMapImage(name: string | null | undefined): MapImage | null {
  const [img, setImg] = useState<{ name: string; img: MapImage } | null>(null);
  useEffect(() => {
    if (!name) return;
    const cached = loaded.get(name);
    if (cached) {
      setImg({ name, img: cached });
      return;
    }
    let live = true;
    loadImage(name)
      .then((m) => live && setImg({ name, img: m }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  if (!name) return null;
  return loaded.get(name) ?? (img?.name === name ? img.img : null);
}

/** Whether a world position is inside a walkable volume (a metre or so of slack, as Link's position is his feet). */
export function inWalk(w: MapWalk, x: number, z: number, slack = 1.5): boolean {
  const r = (w.r * Math.PI) / 180,
    dx = x - w.x,
    dz = z - w.z;
  const lx = Math.cos(r) * dx + Math.sin(r) * dz,
    lz = -Math.sin(r) * dx + Math.cos(r) * dz;
  return Math.abs(lx) <= w.w / 2 + slack && Math.abs(lz) <= w.d / 2 + slack;
}

/** A world position on a place's picture, in percent of its width and height (+X right, +Z down). */
export function project(p: MapPlace, x: number, z: number, aspect: number) {
  return { left: 50 + ((x - p.center[0]) / p.span) * 100, top: 50 + ((z - p.center[1]) / (p.span * aspect)) * 100 };
}

function inMask(p: MapPlace, era: MapEra | null, x: number, z: number): boolean {
  const m = era?.mask;
  if (!m) return false;
  const { left, top } = project(p, x, z, m.height / m.width);
  const gx = Math.floor((left / 100) * m.width),
    gy = Math.floor((top / 100) * m.height);
  return gx >= 0 && gy >= 0 && gx < m.width && gy < m.height && m.bits[gy * m.width + gx] === "1";
}

/** The place a position in `area`'s Banc belongs to: a place drawn inside it (Lake Hylia in Hyrule Field) when the
 *  point falls on that place's own picture, else the area itself. */
export function placeAt(idx: MapIndex | null, area: string, x: number, z: number): string {
  if (!idx) return area;
  for (const [id, p] of Object.entries(idx.places)) {
    if (p.within === area && (inMask(p, p.child, x, z) || inMask(p, p.adult, x, z))) return id;
  }
  return area;
}

/** The report with every entry moved to the place it is drawn in (see placeAt). */
export function regroup(r: Report | null, idx: MapIndex | null): Report | null {
  if (!r || !idx || !Object.values(idx.places).some((p) => p.within)) return r;
  const move = (e: RepEntry): RepEntry => {
    const c = coords(e);
    if (!c || !e.area) return e;
    const area = placeAt(idx, e.area, c[0], c[2]);
    return area === e.area ? e : { ...e, area };
  };
  return { ...r, categories: r.categories.map((c) => ({ ...c, entries: c.entries.map(move) })) };
}

/** Index of the floor a height is on: the highest floor whose base is at or below it (with a small margin). */
export function floorOf(p: MapPlace, y: number): number {
  let k = 0;
  p.floors.forEach((f, i) => {
    if (f.y <= y + 1.5) k = i;
  });
  return k;
}

/** Live map name ("HyruleField_Adult", "ZoraDomain_Adult_Alternative") and position -> place. */
export function placeOfLive(idx: MapIndex | null, map: string | null | undefined, pos: Vec3 | null | undefined): string | null {
  if (!map) return null;
  const base = map.split("_")[0];
  return pos ? placeAt(idx, base, pos[0], pos[2]) : base;
}
