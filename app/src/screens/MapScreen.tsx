import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Back, Chevron, Close, ExitArrow, Funnel, Gear, Locate } from "../components/icons";
import { LandIcon, LinkArrow, Marker } from "../components/art";
import { Maze } from "../components/Maze";
import { hintsFor, type Near } from "../hints";
import { LAND_KINDS, LANDMARK, useLandmarks, type LandKind } from "../landmarks";
import { Seg, Sheet, Sync, Toggle } from "../components/chrome";
import { WORLD } from "../data/content";
import type { Game } from "../model";
import { useLocal, useShared } from "../store";
import { areaRows, cat, entriesFor, KIND_NAME, MAP_KINDS, overall, pct, prettyArea, type AreaRow, type MapKind, type Report } from "../report";
import {
  isMapImageReady,
  prepareMapImage,
  floorOf,
  inWalk,
  placeAt,
  placeOfLive,
  preloadAllMapImages,
  preloadMapSources,
  project,
  regroup,
  useMapImage,
  useMapIndex,
  useMapIndexPending,
  type MapIndex,
  type MapPlace,
} from "../maps";

type Era = "child" | "adult";

/** Hand-drawn-style paper, used when the game's own map pictures cannot be read. Not any in-game map. */
function Paper({ seed, world }: { seed: string; world?: boolean }) {
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = (i: number) => ((h >> (i % 24)) & 31) / 31;
  const blob = `M${14 + r(1) * 10} ${30 + r(2) * 10} C${30 + r(3) * 10} ${10 + r(4) * 8} ${70 + r(5) * 10} ${10 + r(6) * 8} ${86 - r(7) * 8} ${28 + r(8) * 8}
    C${96} ${48 + r(9) * 10} ${90 - r(10) * 6} ${80 + r(11) * 8} ${64 + r(12) * 8} ${88 + r(13) * 5} C${40 + r(14) * 10} ${98} ${16 + r(15) * 8} ${88} ${10 + r(16) * 6} ${64 + r(17) * 8} C${6} ${50} ${8} ${38} ${14 + r(1) * 10} ${30 + r(2) * 10}Z`;
  return (
    <svg className="paper" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id="pap">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed={h % 50} />
          <feColorMatrix values="0 0 0 0 .45  0 0 0 0 .33  0 0 0 0 .15  0 0 0 .22 0" />
        </filter>
        <radialGradient id="vg" cx=".5" cy=".5" r=".75">
          <stop offset=".55" stopColor="#0000" />
          <stop offset="1" stopColor="#7a5a2d66" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="#e3cc94" />
      <rect width="100" height="100" filter="url(#pap)" />
      {world ? (
        <>
          <path d="M6 22C14 8 40 6 58 10c18 3 32 12 36 30 3 16-2 34-10 46-10 12-36 12-56 8C16 90 6 70 6 50z" fill="#c7cf8a" stroke="#7a5a2d" strokeWidth=".6" />
          <path d="M44 30C48 44 52 52 64 60S88 62 92 56" fill="none" stroke="#7fb3c6" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="52" cy="84" rx="12" ry="6" fill="#9ccbd6" stroke="#5a8a9a" strokeWidth=".5" />
        </>
      ) : (
        <>
          <path d={blob} fill="#d9c27a" stroke="#6b4a1f" strokeWidth=".7" />
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={14 + r(i) * 72} cy={20 + r(i + 5) * 66} r={1.3 + r(i + 9) * 1.4} fill="#7da05a" opacity=".7" />
          ))}
        </>
      )}
      <rect width="100" height="100" fill="url(#vg)" />
    </svg>
  );
}

/** A picture that can be dragged and zoomed (mouse wheel, double click or two fingers). At zoom 1 it fits the view's
 *  width, or with `cover` fills the whole view (a number: at most that many widths); `focus` (0..1 of the picture) is centred whenever `focusKey` changes.
 *  `children` may be a function of the zoom, to show more detail closer in. */
/** The part of the picture on screen, as fractions of its width and height, and its width in pixels. */
export interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  px: number;
}

export function PanZoom({
  aspect,
  cover,
  fit,
  focus,
  focusKey,
  children,
}: {
  aspect: number;
  cover?: boolean | number;
  fit?: boolean;
  focus?: { x: number; y: number } | null;
  focusKey?: string;
  children: ReactNode | ((zoom: number, view: View) => ReactNode);
}) {
  const view = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(400),
    [vh, setVh] = useState(800);
  const [z, setZ] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pts: Map<number, { x: number; y: number }>; moved: number; pinch?: number }>({ pts: new Map(), moved: 0 });
  /** The focusKey last centred on, and whether the user has moved or zoomed the map since. */
  const placed = useRef<{ key?: string; touched: boolean }>({ touched: false });

  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    setVw(el.clientWidth);
    setVh(el.clientHeight);
    const ro = new ResizeObserver(() => {
      setVw(el.clientWidth);
      setVh(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fill = Math.max(1, vh / (vw * aspect));
  // (`fit`: never taller than the view at zoom 1, for tall pictures in a wide window)
  const base = fit
    ? Math.min(typeof cover === "number" ? cover : 1, (vh * 0.96) / (vw * aspect))
    : cover === true
      ? fill
      : typeof cover === "number"
        ? Math.min(cover, fill)
        : 1;
  const cw = vw * base * z,
    ch = cw * aspect;
  const clamp = (x: number, y: number, w = cw, h = ch) => ({
    x: w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, x)),
    y: h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, y)),
  });
  // (before paint, so a new picture never shows a frame at the old one's position)
  // Another picture under the same focusKey (Young and Adult Link's maps) keeps the place the user left the map at.
  useLayoutEffect(() => {
    const p = placed.current;
    if (p.key === focusKey && p.touched) {
      setT((o) => clamp(o.x, o.y));
      return;
    }
    if (p.key !== focusKey) p.touched = false;
    p.key = focusKey;
    const f = focus ?? { x: 0.5, y: 0.5 };
    setT(clamp(vw / 2 - f.x * cw, vh / 2 - f.y * ch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, vw, vh, aspect]);

  const zoomAt = (nz: number, px: number, py: number) => {
    nz = Math.min(4, Math.max(1, nz));
    placed.current.touched = true;
    const k = nz / z;
    const w = vw * base * nz;
    setZ(nz);
    setT(clamp(px - (px - t.x) * k, py - (py - t.y) * k, w, w * aspect));
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = view.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div
      ref={view}
      className="pz"
      onWheel={(e) => {
        const p = local(e);
        zoomAt(z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), p.x, p.y);
      }}
      onDoubleClick={(e) => {
        const p = local(e);
        zoomAt(z * 1.6, p.x, p.y);
      }}
      onPointerDown={(e) => {
        drag.current.pts.set(e.pointerId, local(e));
        drag.current.moved = 0;
        drag.current.pinch = undefined;
      }}
      onPointerMove={(e) => {
        const d = drag.current,
          prev = d.pts.get(e.pointerId);
        if (!prev) return;
        const p = local(e);
        if (d.pts.size >= 2) {
          d.pts.set(e.pointerId, p);
          const [a, b] = [...d.pts.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (d.pinch) zoomAt(z * (dist / d.pinch), (a.x + b.x) / 2, (a.y + b.y) / 2);
          d.pinch = dist;
          d.moved += 10;
          return;
        }
        d.moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
        d.pts.set(e.pointerId, p);
        if (d.moved > 4) {
          placed.current.touched = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          setT((o) => clamp(o.x + p.x - prev.x, o.y + p.y - prev.y));
        }
      }}
      onPointerUp={(e) => {
        drag.current.pts.delete(e.pointerId);
      }}
      onPointerCancel={(e) => {
        drag.current.pts.delete(e.pointerId);
      }}
      onClickCapture={(e) => {
        if (drag.current.moved > 4) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      <div className="pz-in" style={{ width: cw, height: ch, transform: `translate(${t.x}px, ${t.y}px)` }}>
        {typeof children === "function" ? children(z, { x0: -t.x / cw, x1: (vw - t.x) / cw, y0: -t.y / ch, y1: (vh - t.y) / ch, px: cw }) : children}
      </div>
    </div>
  );
}

interface Props {
  report: Report | null;
  game: Game | null;
  connected: boolean;
  onHome: () => void;
  start?: string | null;
}

type Prefs = {
  kinds: Record<MapKind, boolean>;
  /** Rumor Hunt landmarks shown on area maps. */
  marks: Record<LandKind, boolean>;
  incompleteOnly: boolean;
  contents: boolean;
  showLink: boolean;
  gamePictures: boolean;
  follow: boolean;
  era: Era;
  /** Draw only the parts of the Lost Woods maze that Link has walked through. */
  reveal: boolean;
  /** Which version of the defaults these were saved under (see PREFS_VERSION). */
  v: number;
};

/** Raise this to put the display filters back to the defaults once for everyone. Version 3: every layer starts switched
 *  off (a clean map), and from then on the choices a player makes are kept. */
const PREFS_VERSION = 3;
const ALL_OFF = {
  kinds: { chests: false, skulltulas: false, "heart-pieces": false, "heart-containers": false },
  marks: { stone: false, grotto: false, cow: false, scarecrow: false, frog: false, owl: false, beehive: false },
};
const ALL_ON = {
  kinds: { chests: true, skulltulas: true, "heart-pieces": true, "heart-containers": true },
  marks: { stone: true, grotto: true, cow: true, scarecrow: true, frog: true, owl: true, beehive: true },
};

const MAP_DEFAULTS: Prefs = {
  ...ALL_OFF,
  incompleteOnly: false,
  contents: true,
  showLink: true,
  gamePictures: true,
  follow: true,
  era: "child",
  reveal: false,
  v: PREFS_VERSION,
};

/** The first visible layer, shared by navigation and the destination so we prepare exactly what it will show. */
function startingLayer(place: MapPlace | null, preferred: Era, liveY: number | null, entries: ReturnType<typeof entriesFor>) {
  const eras = place ? (["child", "adult"] as Era[]).filter((e) => place[e]) : [];
  const era = eras.includes(preferred) ? preferred : (eras[0] ?? "child");
  const floors = place?.floors ?? [];
  let floor = 0;
  if (floors.length && place) {
    if (liveY !== null) floor = floorOf(place, liveY);
    else {
      const open = new Map<number, number>();
      for (const e of entries)
        if (e.pos && e.have < e.of) {
          const k = floorOf(place, e.pos[1]);
          open.set(k, (open.get(k) ?? 0) + 1);
        }
      const best = [...open.entries()].sort((a, b) => b[1] - a[1])[0];
      floor = best
        ? best[0]
        : Math.max(
            0,
            floors.findIndex((f) => f.name === "1F"),
          );
    }
  }
  return { era, floor, image: place ? (place.dungeon ? floors[floor]?.image : place[era]?.image) : null };
}

export function MapScreen({ report: raw, game, connected, onHome, start }: Props) {
  const idx = useMapIndex();
  const pending = useMapIndexPending();
  const [area, setArea] = useState<string | null>(start ?? null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const navigation = useRef(0);
  useEffect(
    () => () => {
      navigation.current++;
    },
    [],
  );
  const [sheet, setSheet] = useState<null | "progress" | "completion" | "filter" | "settings">(null);
  const [sel, setSel] = useState<string | null>(null);
  // (saved settings from before this version lack the newer keys; the defaults fill them in)
  const [saved, setPrefs] = useLocal<Partial<Prefs>>("map.prefs", MAP_DEFAULTS);
  // (filters saved before the current defaults go back to showing everything, once; the other settings are kept)
  const p: Prefs = {
    ...MAP_DEFAULTS,
    ...saved,
    ...(saved.v === PREFS_VERSION ? {} : { kinds: MAP_DEFAULTS.kinds, marks: MAP_DEFAULTS.marks, incompleteOnly: false }),
    v: PREFS_VERSION,
  };
  useEffect(() => {
    if (idx && p.gamePictures) void preloadAllMapImages(idx);
  }, [idx, p.gamePictures]);
  const index = p.gamePictures ? idx : null;
  const report = useMemo(() => regroup(raw, idx), [raw, idx]);
  const rows = useMemo(() => areaRows(report), [report]);
  const linkPlace = placeOfLive(idx, game?.map, game?.pos);
  const linkEra: Era | null = game?.age === "adult" ? "adult" : game?.age === "child" ? "child" : null;

  // Like the original, the map follows Link to each new place while the game is connected.
  const lastLink = useRef<string | null>(null);
  useEffect(() => {
    if (connected && p.follow && linkPlace && linkPlace !== lastLink.current && lastLink.current !== null) {
      void go(linkPlace);
    }
    lastLink.current = linkPlace;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkPlace, connected]);

  const layerFor = (a: string | null) =>
    startingLayer(
      a ? (index?.places[a] ?? null) : null,
      a === linkPlace && linkEra ? linkEra : p.era,
      a === linkPlace ? (game?.pos?.[1] ?? null) : null,
      a && report ? entriesFor(report, a) : [],
    );
  async function go(a: string | null) {
    const ticket = ++navigation.current;
    const image = a ? layerFor(a).image : null;
    setOpenError(null);
    if (image && !isMapImageReady(image)) {
      setOpening(true);
      try {
        await prepareMapImage(image);
      } catch {
        if (ticket === navigation.current) {
          setOpening(false);
          setOpenError("Could not open that map. Check the connection or game files and try the location again.");
        }
        return;
      }
    }
    if (ticket !== navigation.current) return;
    setOpening(false);
    setArea(a);
    setSel(null);
    setSheet(null);
  }

  if (p.gamePictures && pending) {
    return (
      <div className="mapwrap" style={{ background: "#0f0b08" }}>
        <div className="map-top">
          <button className="icon-btn" onClick={onHome} aria-label="Home">
            <Back />
          </button>
        </div>
        <p className="empty" style={{ marginTop: "5em" }} role="status">
          Opening map...
        </p>
      </div>
    );
  }
  if (!report || rows.length === 0) {
    return (
      <div className="mapwrap" style={{ background: "#0f0b08" }}>
        <div className="map-top" style={{ background: "none" }}>
          <button className="icon-btn" onClick={onHome} aria-label="Home">
            <Back />
          </button>
          <Sync on={connected} />
        </div>
        <p className="empty" style={{ marginTop: "5em" }}>
          The map needs the list of chests, Gold Skulltulas and Heart pieces, which this app reads from your own Longshot game folder and save. It could not
          find them yet. Start Longshot once, or set OJ_GAME to the folder that holds romfs.
        </p>
      </div>
    );
  }

  const top = (
    <div className="map-top torn">
      <button className="icon-btn" onClick={area ? () => go(null) : onHome} aria-label="Back">
        <Back />
      </button>
      {opening && <small role="status">Opening map...</small>}
      {openError && (
        <small role="alert" style={{ maxWidth: "65%" }}>
          {openError}
        </small>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: ".4em" }}>
        <Sync on={connected} />
        <button className="icon-btn" onClick={() => setSheet("settings")} aria-label="Map settings">
          <Gear />
        </button>
      </div>
    </div>
  );
  const settings = sheet === "settings" && <Settings prefs={p} setPrefs={setPrefs} onClose={() => setSheet(null)} />;
  const progress = sheet === "progress" && (
    <Sheet title="Completion Progress" onClose={() => setSheet(null)}>
      <div style={{ textAlign: "center", padding: ".4em 0 1em" }}>
        <div className="big">{overall(report)}%</div>
        <div className="small muted" style={{ padding: "0 1.4em" }}>
          Area Achievement Rate (chests, skulltulas and hearts, weighted by count)
        </div>
      </div>
      {[...rows]
        .sort((a, b) => pct(b.have, b.of) - pct(a.have, a.of))
        .map((r) => (
          <button
            key={r.area}
            className="rowline"
            style={{ width: "100%", background: "none", border: 0, padding: ".9em 1.2em", borderTop: "1px solid #2c2118" }}
            onClick={() => go(r.area)}
          >
            <b>{prettyArea(r.area)}</b>
            <span className="num">{pct(r.have, r.of)}%</span>
          </button>
        ))}
    </Sheet>
  );

  if (!area) {
    return (
      <div className="mapwrap">
        <WorldMap index={index} rows={rows} linkPlace={linkPlace} showLink={p.showLink} onPick={go} />
        {top}
        <div className="map-title">
          Hyrule
          <i />
        </div>
        <button className="round" style={{ top: "6.4em" }} aria-label="Go to Link" onClick={() => linkPlace && go(linkPlace)}>
          <Locate />
        </button>
        <button className="pill-map" onClick={() => setSheet("progress")}>
          <Chevron /> Completion Progress {overall(report)}%
        </button>
        {progress}
        {settings}
      </div>
    );
  }

  return (
    <AreaMap
      key={area}
      area={area}
      place={index?.places[area] ?? null}
      report={report}
      rows={rows}
      game={game}
      linkPlace={linkPlace}
      linkEra={linkEra}
      prefs={p}
      setPrefs={setPrefs}
      sel={sel}
      setSel={setSel}
      sheet={sheet}
      setSheet={setSheet}
      top={top}
      settings={settings}
      onGo={go}
    />
  );
}

/** What is found of each kind in an area, as the original's banners show it: an icon and "found/all". */
function Counts({ kinds }: { kinds: AreaRow["kinds"] }) {
  return (
    <span className="counts">
      {MAP_KINDS.filter((k) => kinds[k]).map((k) => (
        <i key={k} className={kinds[k]![0] >= kinds[k]![1] ? "full" : ""}>
          <Marker kind={k} />
          {kinds[k]![0]}/{kinds[k]![1]}
        </i>
      ))}
    </span>
  );
}

/** A place's name on the world map: a small plaque with a ring for how much of it is found. Hovering it (or focusing it
 *  with the keyboard) opens a card of what has been found there and what is still missing. */
function Plaque({
  name,
  row,
  dungeon,
  dot,
  side,
  left,
  top,
  onPick,
}: {
  name: string;
  row?: AreaRow;
  dungeon: boolean;
  dot: boolean;
  side: string;
  left: number;
  top: number;
  onPick: () => void;
}) {
  const p = row ? pct(row.have, row.of) : 0,
    done = !!row && row.have >= row.of;
  const kinds = row ? MAP_KINDS.filter((k) => row.kinds[k]) : [];
  return (
    <button
      className={`plaque ${dot ? "dot" : ""} ${dungeon ? "dun" : ""} ${done ? "done" : ""}`}
      style={{ left: `${left}%`, top: `${top}%` }}
      onClick={onPick}
      aria-label={row ? `${name}, ${p}% found` : name}
    >
      {!dot && (
        <>
          {row && (
            <span className="ring" style={{ "--p": p } as CSSProperties}>
              {done && "✓"}
            </span>
          )}
          <span className="nm">{name}</span>
          {row && !done && <span className="pc">{p}%</span>}
        </>
      )}
      <span className={`acard ${side}`} role="tooltip">
        <b className="acard-t">
          {name}
          <span>{row ? `${p}%` : ""}</span>
        </b>
        {kinds.map((k) => {
          const [h, o] = row!.kinds[k]!;
          return (
            <span key={k} className={`acard-row ${h >= o ? "full" : ""}`}>
              <span className="ic">
                <Marker kind={k} done={h >= o} />
              </span>
              <span className="k">{KIND_NAME[k]}</span>
              <span className="v">
                {h}/{o}
              </span>
              <i className="bar">
                <i style={{ width: `${(100 * h) / o}%` }} />
              </i>
            </span>
          );
        })}
        {!row && <small>Nothing to collect here.</small>}
      </span>
    </button>
  );
}

/** The game's world map with each place's name where the game puts it. */
function WorldMap({
  index,
  rows,
  linkPlace,
  showLink,
  onPick,
}: {
  index: MapIndex | null;
  rows: ReturnType<typeof areaRows>;
  linkPlace: string | null;
  showLink: boolean;
  onPick: (a: string) => void;
}) {
  const img = useMapImage(index ? index.world.image : null);
  const byArea = new Map(rows.map((r) => [r.area, r]));
  if (index && !img) return null; // (the picture is still being read: plain paper rather than a stand-in map)
  if (!index || !img) {
    // (no game pictures: the app's own schematic)
    return (
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", scrollbarWidth: "none" }}>
        <div style={{ position: "relative", height: "230%" }}>
          <Paper seed="world" world />
          {rows.map((r) => {
            const q = WORLD[r.area] ?? { x: 50, y: 50 };
            return (
              <button
                key={r.area}
                className="cap"
                style={{ left: `${Math.min(86, Math.max(14, q.x))}%`, top: `${6 + q.y * 0.9}%`, cursor: "pointer", fontSize: ".72em" }}
                onClick={() => onPick(r.area)}
              >
                {prettyArea(r.area)}
                <small>
                  {r.have}/{r.of}
                  {r.have >= r.of ? " ✓" : ""}
                </small>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  const { width: W, height: H, labels } = index.world;
  const at = (id: string) => labels[id] && { left: 50 + (labels[id][0] / W) * 100, top: 50 - (labels[id][1] / H) * 100 };
  const here = linkPlace ? at(linkPlace) : null;
  return (
    <PanZoom aspect={img.h / img.w} cover focus={here ? { x: here.left / 100, y: here.top / 100 } : { x: 0.55, y: 0.5 }} focusKey={linkPlace ?? "centre"}>
      {(zoom, view) => (
        <>
          <img className="pz-img" src={img.url} alt="" draggable={false} />
          {Object.keys(labels).map((id) => {
            const p = at(id)!,
              dungeon = !!index.places[id]?.dungeon;
            // (the hover card opens toward the middle of the screen so it stays in view)
            const fx = (p.left / 100 - view.x0) / (view.x1 - view.x0),
              fy = (p.top / 100 - view.y0) / (view.y1 - view.y0);
            const side = `${fy < 0.42 ? "below" : "above"} ${fx < 0.3 ? "from-left" : fx > 0.7 ? "from-right" : ""}`;
            // (dungeons sit close to their areas: a small badge until zoomed in, then their name too)
            return (
              <Plaque
                key={id}
                name={prettyArea(id)}
                row={byArea.get(id)}
                dungeon={dungeon}
                dot={dungeon && zoom < 1.6}
                side={side}
                left={p.left}
                top={p.top}
                onPick={() => onPick(id)}
              />
            );
          })}
          {here && showLink && (
            <div className="link" style={{ left: `${here.left}%`, top: `calc(${here.top}% - 1.9em)` }}>
              <LinkArrow />
            </div>
          )}
        </>
      )}
    </PanZoom>
  );
}

function AreaMap(props: {
  area: string;
  place: MapPlace | null;
  report: Report;
  rows: ReturnType<typeof areaRows>;
  game: Game | null;
  linkPlace: string | null;
  linkEra: Era | null;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  sel: string | null;
  setSel: (s: string | null) => void;
  sheet: null | "progress" | "completion" | "filter" | "settings";
  setSheet: (s: null | "progress" | "completion" | "filter" | "settings") => void;
  top: ReactNode;
  settings: ReactNode;
  onGo: (a: string | null) => void;
}) {
  const { area, place, report, rows, game, linkPlace, linkEra, prefs, setPrefs, sel, setSel, sheet, setSheet, top, settings, onGo } = props;
  const idx = useMapIndex();
  const landmarks = useLandmarks();
  const [found] = useShared<Record<string, number>>("gossip.found", {});
  // Landmarks Link has stood right beside while the app was connected (when, as a time). The save has no flag for "spoke to this
  // stone" or "entered this grotto", so this is the best the app can tell; it is kept apart from the Rumor Hunt points.
  const [visited, setVisited] = useShared<Record<string, number>>("landmark.visited", {});
  const [mark, setMark] = useState<string | null>(null);
  // (a landmark picked on one map isn't picked on the next)
  useEffect(() => setMark(null), [area]);
  const [seenWalk, setSeenWalk] = useShared<number[]>("lostwood.seen", []);
  const here = linkPlace === area;
  const all = entriesFor(report, area);
  const row = rows.find((r) => r.area === area) ?? { area, kinds: {}, have: 0, of: 0 };

  // ----- which picture: the era (field maps) or the floor (dungeons)
  const eras: Era[] = place ? (["child", "adult"] as Era[]).filter((e) => place[e]) : [];
  const firstLayer = startingLayer(place, here && linkEra ? linkEra : prefs.era, here ? (game?.pos?.[1] ?? null) : null, all);
  const [era, setEra] = useState<Era>(firstLayer.era);
  const floors = place?.floors ?? [];
  const [floor, setFloor] = useState(firstLayer.floor);
  const [layerBusy, setLayerBusy] = useState(false);
  const [layerError, setLayerError] = useState(false);
  const layerRequest = useRef(0);
  useEffect(
    () => () => {
      layerRequest.current++;
    },
    [],
  );
  async function pickLayer(nextEra: Era, nextFloor: number) {
    const ticket = ++layerRequest.current;
    const image = place ? (place.dungeon ? floors[nextFloor]?.image : place[nextEra]?.image) : null;
    setLayerError(false);
    if (image && !isMapImageReady(image)) {
      setLayerBusy(true);
      try {
        await prepareMapImage(image);
      } catch {
        if (ticket === layerRequest.current) {
          setLayerBusy(false);
          setLayerError(true);
        }
        return;
      }
    }
    if (ticket !== layerRequest.current) return;
    setLayerBusy(false);
    setEra(nextEra);
    setFloor(nextFloor);
    if (nextEra !== era) setPrefs({ ...prefs, era: nextEra });
  }
  const pickEra = (next: Era) => void pickLayer(next, floor);
  const imageName = place ? (place.dungeon ? floors[floor]?.image : place[era]?.image) : null;
  const img = useMapImage(imageName);
  const usePicture = !!(place && imageName);
  const aspect = img ? img.h / img.w : 0.72;

  // ----- positions
  let proj: (x: number, z: number) => { left: number; top: number };
  if (usePicture) {
    proj = (x, z) => project(place!, x, z, aspect);
  } else {
    const pts = all.filter((e) => e.pos);
    const xs = pts.map((e) => e.pos![0]),
      zs = pts.map((e) => e.pos![2]);
    const minx = Math.min(...xs, 0),
      maxx = Math.max(...xs, 1),
      minz = Math.min(...zs, 0),
      maxz = Math.max(...zs, 1);
    const spanx = Math.max(maxx - minx, 40),
      spanz = Math.max(maxz - minz, 40);
    proj = (x, z) => ({ left: 12 + (76 * (x - minx)) / spanx, top: 16 + (56 * (z - minz)) / spanz });
  }
  const onFloor = (y: number) => !place?.dungeon || !usePicture || floorOf(place, y) === floor;
  const shown = all.filter((e) => prefs.kinds[e.kind] && (!prefs.incompleteOnly || e.have < e.of) && (!e.pos || onFloor(e.pos[1])));
  const selected = shown.find((e) => e.id === sel) ?? null;
  const nearby: Near[] = [
    ...((usePicture && !place?.dungeon ? place?.[era]?.exits : null) ?? [])
      .filter((x) => x.to)
      .map((x) => ({ name: `the way to ${prettyArea(x.to)}`, x: x.x, z: x.z })),
    ...(landmarks ?? [])
      .filter((m) => m.eras.includes(era) && placeAt(idx, m.area, m.pos[0], m.pos[2]) === area)
      .map((m) => ({ name: `a ${LANDMARK[m.kind].name}`, x: m.pos[0], z: m.pos[2] })),
  ];
  const link =
    here && game?.pos && onFloor(game.pos[1]) && (!usePicture || place!.dungeon || !linkEra || linkEra === era) ? proj(game.pos[0], game.pos[2]) : null;
  const exits = usePicture && !place!.dungeon ? (place![era]?.exits ?? []) : [];
  const walk = usePicture && !place!.dungeon ? (place![era]?.walk ?? []) : [];
  const walked = useMemo(() => new Set(seenWalk), [seenWalk]);
  // Mark each landmark Link stands within about 4 m of (and no more than 6 m above or below).
  useEffect(() => {
    if (!here || !game?.pos || !landmarks || !linkEra) return;
    const [x, y, z] = game.pos;
    const near = landmarks.filter(
      (m) =>
        !visited[m.id] &&
        m.eras.includes(linkEra) &&
        placeAt(idx, m.area, m.pos[0], m.pos[2]) === area &&
        Math.hypot(m.pos[0] - x, m.pos[2] - z) <= 4 &&
        Math.abs(m.pos[1] - y) <= 6,
    );
    if (near.length) setVisited({ ...visited, ...Object.fromEntries(near.map((m) => [m.id, Date.now()])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pos?.[0], game?.pos?.[1], game?.pos?.[2], here, landmarks]);
  // Remember each maze volume Link walks through, to draw only those when "reveal as I explore" is on.
  useEffect(() => {
    if (!here || !walk.length || !game?.pos) return;
    const now = walk.flatMap((w, i) => (inWalk(w, game.pos![0], game.pos![2]) && !walked.has(i) ? [i] : []));
    if (now.length) setSeenWalk([...seenWalk, ...now]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pos?.[0], game?.pos?.[2], here, walk.length]);
  const pct2 = (v: number) => `${v}%`;
  // How many layers are switched on (item kinds and landmark kinds).
  const layersOn = MAP_KINDS.filter((k) => prefs.kinds[k]).length + LAND_KINDS.filter((k) => (prefs.marks ?? MAP_DEFAULTS.marks)[k]).length;
  // Without Link to follow, open on the middle of what is drawn (the area's pictures have wide empty margins).
  const drawn = [...all.filter((e) => e.pos && onFloor(e.pos[1])).map((e) => proj(e.pos![0], e.pos![2])), ...exits.map((x) => proj(x.x, x.z))];
  const centre = drawn.length
    ? {
        x: (Math.min(...drawn.map((d) => d.left)) + Math.max(...drawn.map((d) => d.left))) / 200,
        y: (Math.min(...drawn.map((d) => d.top)) + Math.max(...drawn.map((d) => d.top))) / 200,
      }
    : null;
  const openOn = (k: number) => all.some((e) => e.pos && e.have < e.of && floorOf(place!, e.pos[1]) === k);

  // Read the other era's or floors' pictures now, so switching to them is instant.
  useEffect(() => {
    if (place) preloadMapSources([place.child?.image, place.adult?.image, ...place.floors.map((f) => f.image)]);
  }, [place]);

  const layer = () => (
    <>
      {usePicture && img && <img className="pz-img" src={img.url} alt="" draggable={false} />}
      {walk.length > 0 && <Maze walk={walk} place={place!} aspect={aspect} seen={prefs.reveal ? walked : null} />}
      {exits.map((x, i) => {
        const q = proj(x.x, x.z);
        const ang = (Math.atan2(q.top - 50, (q.left - 50) / aspect) * 180) / Math.PI + 90;
        return (
          <button key={i} className="exit" style={{ left: pct2(q.left), top: pct2(q.top) }} onClick={() => onGo(x.to)} aria-label={`To ${prettyArea(x.to)}`}>
            <span className="chev">
              <span style={{ display: "grid", transform: `rotate(${ang}deg)` }}>
                <ExitArrow />
              </span>
            </span>
            <small>{prettyArea(x.to)}</small>
          </button>
        );
      })}
      {shown.map((e) => {
        if (!e.pos) return null;
        const q = proj(e.pos[0], e.pos[2]);
        return (
          <button
            key={e.id}
            className={`mk ${e.id === sel ? "sel" : ""} ${e.have >= e.of ? "done" : ""}`}
            style={{ left: pct2(q.left), top: pct2(q.top) }}
            onClick={() => {
              setMark(null);
              setSel(e.id);
            }}
            aria-label={e.label}
          >
            <Marker kind={e.kind} done={e.have >= e.of} />
          </button>
        );
      })}
      {usePicture &&
        !place!.dungeon &&
        (landmarks ?? [])
          .filter((m) => (prefs.marks ?? MAP_DEFAULTS.marks)[m.kind] && m.eras.includes(era) && placeAt(idx, m.area, m.pos[0], m.pos[2]) === area)
          .map((m) => {
            const q = proj(m.pos[0], m.pos[2]);
            return (
              <button
                key={m.id}
                className={`mk land ${m.id === mark ? "sel" : ""} ${found[m.id] || visited[m.id] ? "done" : ""}`}
                style={{ left: pct2(q.left), top: pct2(q.top) }}
                onClick={() => {
                  setSel(null);
                  setMark(m.id === mark ? null : m.id);
                }}
                aria-label={LANDMARK[m.kind].name}
              >
                <LandIcon kind={m.kind} done={!!(found[m.id] || visited[m.id])} />
              </button>
            );
          })}
      {link && prefs.showLink && (
        <div
          className="link"
          style={{ left: pct2(link.left), top: pct2(link.top), transform: `translate(-50%, -50%) rotate(${180 - (game?.facing ?? 180)}deg)` }}
        >
          <LinkArrow />
        </div>
      )}
    </>
  );

  return (
    <div className="mapwrap">
      {usePicture ? (
        <>
          <PanZoom aspect={aspect} cover={1.7} focus={link ? { x: link.left / 100, y: link.top / 100 } : centre} focusKey={`${area}:${floor}:${!!link}`}>
            {img ? layer() : null}
          </PanZoom>
          {!img && (
            <p className="empty" style={{ position: "absolute", top: "45%", left: 0, right: 0, textAlign: "center" }}>
              Reading the map from your game files…
            </p>
          )}
        </>
      ) : (
        <>
          <Paper seed={area} />
          <div style={{ position: "absolute", inset: 0 }}>{layer()}</div>
        </>
      )}
      {top}
      {(layerBusy || layerError) && (
        <p className="map-layer-status" role="status">
          {layerError ? "Could not open that layer. Please try again." : "Opening map layer..."}
        </p>
      )}
      <div className="map-title">
        {prettyArea(area)}
        <i />
      </div>
      {eras.length > 1 && !place?.dungeon && (
        <div className="era-tabs">
          {eras.map((e) => (
            <button key={e} className={e === era ? "on" : ""} onClick={() => pickEra(e)}>
              {e === "child" ? "Young" : "Adult"}
            </button>
          ))}
        </div>
      )}
      {usePicture && place!.dungeon && floors.length > 1 && (
        <div className="floor-tabs">
          {[...floors.keys()].reverse().map((k) => (
            <button key={k} className={k === floor ? "on" : ""} onClick={() => void pickLayer(era, k)} disabled={!floors[k].image}>
              {floors[k].name}
              {openOn(k) && <i />}
              {here && game?.pos && floorOf(place!, game.pos[1]) === k && <b className="here" aria-label="Link is here" />}
            </button>
          ))}
        </div>
      )}
      <button className="round" style={{ top: "6.4em" }} aria-label="Go to Link" onClick={() => linkPlace && onGo(linkPlace)}>
        <Locate />
      </button>
      <button className="filter-btn" aria-label={layersOn ? `Filters, ${layersOn} switched on` : "Filters"} onClick={() => setSheet("filter")}>
        <Funnel />
        <span>Filters</span>
        {layersOn > 0 && <b>{layersOn}</b>}
      </button>
      {shown.length === 0 && (
        <p className="map-hint">
          {layersOn === 0 ? "Everything is switched off. Open Filters to choose what to see." : "Nothing to show here with these filters."}
        </p>
      )}
      {!selected && here && linkEra && !place?.dungeon && eras.includes(linkEra) && linkEra !== era && (
        <button className="pill-era" onClick={() => pickEra(linkEra)}>
          Switch map to Link's current era ›
        </button>
      )}
      {!selected && (
        <button className="pill-map" onClick={() => setSheet("completion")}>
          <Chevron /> Area Completion {pct(row.have, row.of)}%
        </button>
      )}
      {!selected && (
        <div className="corner-counts">
          <Counts kinds={row.kinds} />
        </div>
      )}

      {mark &&
        (() => {
          const m = landmarks?.find((x) => x.id === mark);
          if (!m) return null;
          return (
            <section className="sheet" style={{ background: "#14100c" }}>
              <div className="grab" />
              <header>
                <span style={{ display: "flex", gap: ".8em", alignItems: "center" }}>
                  <span style={{ width: "2.6em", height: "2.6em", display: "inline-block" }}>
                    <LandIcon kind={m.kind} />
                  </span>
                  <b>{LANDMARK[m.kind].name}</b>
                </span>
                <button className="x" onClick={() => setMark(null)} aria-label="Close">
                  <Close />
                </button>
              </header>
              <p className="small muted" style={{ padding: "0 1.2em 1.2em" }}>
                {found[m.id]
                  ? `Found in Rumor Hunt on ${new Date(found[m.id]).toLocaleDateString()}.`
                  : visited[m.id]
                    ? `Visited on ${new Date(visited[m.id]).toLocaleDateString()}: Link stood right beside it while the app was connected. (The save doesn't record whether you spoke to it or went in, so this only means you were there.) Tap Found! in Rumor Hunt for the points.`
                    : "A Rumor Hunt place. Stand beside it with the bridge on and the app marks it as visited; tap Found! in Rumor Hunt for the points."}
                {m.eras.length === 1 ? ` Only there as ${m.eras[0]} Link.` : ""}
              </p>
            </section>
          );
        })()}
      {selected && (
        <section className="sheet" style={{ background: "#14100c" }}>
          <div className="grab" />
          <header>
            <span style={{ display: "flex", gap: ".8em", alignItems: "center" }}>
              <span style={{ width: "2.6em", height: "2.6em", display: "inline-block" }}>
                <Marker kind={selected.kind} done={selected.have >= selected.of} />
              </span>
              <span>
                <div>{prefs.contents ? selected.label.replace(/ in .*? \(/, " (") : KIND_NAME[selected.kind].replace(/s$/, "")}</div>
                <div className="small muted" style={{ fontWeight: 600 }}>
                  {selected.have >= selected.of ? "Complete" : "Not yet"}
                </div>
              </span>
            </span>
            <button className="x" onClick={() => setSel(null)} aria-label="Close">
              <Close />
            </button>
          </header>
          <div className="body">
            <div className="card" style={{ margin: ".4em 1em" }}>
              <h3 style={{ textAlign: "center" }}>Where</h3>
              <div className="rowline small">
                <span>Area</span>
                <span>{prettyArea(selected.area)}</span>
              </div>
              {selected.pos && place?.dungeon && (
                <div className="rowline small">
                  <span>Floor</span>
                  <span>{floors[floorOf(place, selected.pos[1])]?.name}</span>
                </div>
              )}
              {selected.note && !/^room -?\d+ at /.test(selected.note) && (
                <div className="rowline small">
                  <span>Note</span>
                  <span>{selected.note}</span>
                </div>
              )}
            </div>
            <Spoiler
              key={selected.id}
              hints={hintsFor(selected, selected.kind, selected.pos ? { x: selected.pos[0], z: selected.pos[2] } : null, nearby).filter(
                (h) => !(prefs.contents && h.title === "Inside"),
              )}
            />
          </div>
        </section>
      )}

      {sheet === "completion" && (
        <Sheet title="Area Completion" onClose={() => setSheet(null)}>
          <div style={{ textAlign: "center", padding: ".2em 0 .8em" }}>
            <span style={{ fontWeight: 800 }}>{prettyArea(area)} </span>
            <span className="big" style={{ fontSize: "2em" }}>
              {pct(row.have, row.of)}%
            </span>
          </div>
          {MAP_KINDS.filter((k) => row.kinds[k]).map((k) => (
            <div key={k} className="rowline" style={{ padding: ".9em 1.4em", borderTop: "1px solid #2c2118" }}>
              <span style={{ display: "flex", gap: ".7em", alignItems: "center" }}>
                <span style={{ width: "1.8em", height: "1.8em", display: "inline-block" }}>
                  <Marker kind={k} />
                </span>
                {KIND_NAME[k]}
              </span>
              <b className="num">
                {row.kinds[k]![0]}/{row.kinds[k]![1]}
              </b>
            </div>
          ))}
        </Sheet>
      )}
      {sheet === "filter" && (
        <Sheet title="Display Filters" onClose={() => setSheet(null)}>
          <div style={{ padding: "0 1.2em" }}>
            <div style={{ display: "flex", gap: ".6em", margin: ".2em 0 .6em" }}>
              {[
                ["Turn all on", ALL_ON],
                ["Turn all off", ALL_OFF],
              ].map(([label, set]) => (
                <button
                  key={label as string}
                  className="spoil-btn"
                  style={{ margin: 0, padding: ".5em .8em", font: "800 .85em var(--body)" }}
                  onClick={() => setPrefs({ ...prefs, ...(set as typeof ALL_ON) })}
                >
                  {label as string}
                </button>
              ))}
            </div>
            <div className="small muted" style={{ margin: ".4em 0" }}>
              Completion Progress
            </div>
            <Seg
              items={["Incomplete Only", "All"] as const}
              value={prefs.incompleteOnly ? "Incomplete Only" : "All"}
              onChange={(v) => setPrefs({ ...prefs, incompleteOnly: v === "Incomplete Only" })}
            />
            <div className="small muted" style={{ margin: "1.2em 0 .4em" }}>
              Display Items
            </div>
            {MAP_KINDS.map((k) => (
              <div key={k} className="rowline" style={{ padding: ".7em 0" }}>
                <span style={{ display: "flex", gap: ".7em", alignItems: "center" }}>
                  <span style={{ width: "1.8em", height: "1.8em", display: "inline-block" }}>
                    <Marker kind={k} />
                  </span>
                  {KIND_NAME[k]} <span className="muted small">{cat(report, k)?.entries.filter((e) => e.area === area).length ?? 0}</span>
                </span>
                <Toggle on={prefs.kinds[k]} label={KIND_NAME[k]} onChange={(v) => setPrefs({ ...prefs, kinds: { ...prefs.kinds, [k]: v } })} />
              </div>
            ))}
            <div className="small muted" style={{ margin: "1.2em 0 .4em" }}>
              Landmarks (Rumor Hunt places)
            </div>
            {LAND_KINDS.map((k) => {
              const marks = prefs.marks ?? MAP_DEFAULTS.marks;
              return (
                <div key={k} className="rowline" style={{ padding: ".55em 0" }}>
                  <span style={{ display: "flex", gap: ".7em", alignItems: "center" }}>
                    <span style={{ width: "1.8em", height: "1.8em", display: "inline-block" }}>
                      <LandIcon kind={k} />
                    </span>
                    {LANDMARK[k].plural}
                  </span>
                  <Toggle on={marks[k]} label={LANDMARK[k].plural} onChange={(v) => setPrefs({ ...prefs, marks: { ...marks, [k]: v } })} />
                </div>
              );
            })}
          </div>
        </Sheet>
      )}
      {settings}
    </div>
  );
}

function Settings({ prefs, setPrefs, onClose }: { prefs: Prefs; setPrefs: (p: Prefs) => void; onClose: () => void }) {
  return (
    <Sheet title="Map settings" onClose={onClose}>
      <div className="setting">
        <span>Use the game's own map pictures</span>
        <Toggle on={prefs.gamePictures} label="game map pictures" onChange={(v) => setPrefs({ ...prefs, gamePictures: v })} />
      </div>
      <div className="setting">
        <span>Follow Link to each new area</span>
        <Toggle on={prefs.follow} label="follow Link" onChange={(v) => setPrefs({ ...prefs, follow: v })} />
      </div>
      <div className="setting">
        <span>Display contents of treasure chests</span>
        <Toggle on={prefs.contents} label="chest contents" onChange={(v) => setPrefs({ ...prefs, contents: v })} />
      </div>
      <div className="setting">
        <span>Display Link on the map</span>
        <Toggle on={prefs.showLink} label="Link" onChange={(v) => setPrefs({ ...prefs, showLink: v })} />
      </div>
      <div className="setting">
        <span>Reveal the Lost Woods maze as I explore it</span>
        <Toggle on={prefs.reveal} label="reveal the Lost Woods maze as I explore" onChange={(v) => setPrefs({ ...prefs, reveal: v })} />
      </div>
      <p className="note">
        The map pictures, place names' positions and floors are read from your own Longshot game files and kept only on this PC; the app ships none of them.
        Positions come from the game's placement data. Drag to move, scroll or pinch to zoom.
      </p>
    </Sheet>
  );
}

/** The button that keeps a spoiler hidden until it is asked for. */
function Spoiler({ hints }: { hints: { title: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="spoil">
      <h3>Spoiler</h3>
      {!open ? (
        <>
          <p className="small muted" style={{ textAlign: "center", margin: 0 }}>
            How to find it. Hidden until you ask.
          </p>
          <button className="spoil-btn" onClick={() => setOpen(true)}>
            Show me how to get it
          </button>
        </>
      ) : hints.length ? (
        <>
          {hints.map((h) => (
            <p key={h.title} className="hint">
              <b>{h.title}.</b> {h.text}
            </p>
          ))}
          <p className="src">From your own game files. The app can't see how to reach a spot, only where it is and what the game calls it.</p>
          <button className="spoil-btn" onClick={() => setOpen(false)}>
            Hide it again
          </button>
        </>
      ) : (
        <p className="small muted" style={{ textAlign: "center" }}>
          Nothing more is known about this one yet.
        </p>
      )}
    </div>
  );
}
