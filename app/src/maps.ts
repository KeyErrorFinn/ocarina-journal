/** The game's own maps, read by the backend from the player's game folder (see crates/oj-gamedata/src/maps.rs).
 *  Pictures are fetched as bytes and shown from object URLs; nothing from the game ships with the app. */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { Report, RepEntry, Vec3 } from "./report";
import { coords } from "./report";

export interface MapExit { to: string; x: number; z: number }
export interface MapMask { width: number; height: number; bits: string }
export interface MapEra { image: string; exits: MapExit[]; mask: MapMask | null }
export interface MapFloor { name: string; y: number; image: string | null }
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

function loadIndex() {
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

type MapImage = { url: string; w: number; h: number };
const urls = new Map<string, Promise<MapImage>>();
/** Pictures already decoded: returned on the first render, so switching back to one never flashes. */
const loaded = new Map<string, MapImage>();

function loadImage(name: string): Promise<MapImage> {
  let p = urls.get(name);
  if (!p) {
    p = invoke<ArrayBuffer>("get_map_image", { name })
      .then((buf) => URL.createObjectURL(new Blob([buf], { type: name === "world" || name.startsWith("tapestry/") ? "image/jpeg" : "image/png" })))
      .then((url) => new Promise<MapImage>((ok, bad) => {
        const i = new Image();
        i.onload = () => { i.decode().catch(() => {}).finally(() => ok({ url, w: i.naturalWidth, h: i.naturalHeight })); };
        i.onerror = bad;
        i.src = url;
      }))
      .then((m) => (loaded.set(name, m), m));
    p.catch(() => urls.delete(name));
    urls.set(name, p);
  }
  return p;
}

/** Starts reading pictures that may be wanted soon (the other era, the other floors). */
export function preloadMapImages(names: (string | null | undefined)[]) {
  for (const n of names) if (n) loadImage(n).catch(() => {});
}

/** An object URL for one map picture, with its natural size once loaded. Never returns a different picture than the
 *  one asked for, so a screen doesn't briefly show the previous map. */
export function useMapImage(name: string | null | undefined): MapImage | null {
  const [img, setImg] = useState<{ name: string; img: MapImage } | null>(null);
  useEffect(() => {
    if (!name || loaded.has(name)) return;
    let live = true;
    loadImage(name).then((m) => live && setImg({ name, img: m })).catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  if (!name) return null;
  return loaded.get(name) ?? (img?.name === name ? img.img : null);
}

/** A world position on a place's picture, in percent of its width and height (+X right, +Z down). */
export function project(p: MapPlace, x: number, z: number, aspect: number) {
  return { left: 50 + ((x - p.center[0]) / p.span) * 100, top: 50 + ((z - p.center[1]) / (p.span * aspect)) * 100 };
}

function inMask(p: MapPlace, era: MapEra | null, x: number, z: number): boolean {
  const m = era?.mask;
  if (!m) return false;
  const { left, top } = project(p, x, z, m.height / m.width);
  const gx = Math.floor((left / 100) * m.width), gy = Math.floor((top / 100) * m.height);
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
