import { useMemo, useState } from "react";
import { Back, Chevron, Close, Filter, Gear, Locate } from "../components/icons";
import { LinkArrow, Marker } from "../components/art";
import { Seg, Sheet, Sync, Toggle } from "../components/chrome";
import { WORLD } from "../data/content";
import type { Game } from "../model";
import { useLocal } from "../store";
import {
  areaRows, cat, entriesFor, KIND_NAME, MAP_KINDS, overall, pct, prettyArea, type MapKind, type Report,
} from "../report";

/** Live map names ("HyruleField_Adult") start with the report's area id. */
const areaOfMap = (map: string | null | undefined, ids: string[]) => {
  if (!map) return null;
  const base = map.split("_")[0];
  return ids.find((a) => a === base) ?? null;
};

/** Hand-drawn-style paper. Deterministic per key so each area looks distinct; not any in-game map. */
function Paper({ seed, world }: { seed: string; world?: boolean }) {
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = (i: number) => ((h >> (i % 24)) & 31) / 31;
  const blob = `M${14 + r(1) * 10} ${30 + r(2) * 10} C${30 + r(3) * 10} ${10 + r(4) * 8} ${70 + r(5) * 10} ${10 + r(6) * 8} ${86 - r(7) * 8} ${28 + r(8) * 8}
    C${96} ${48 + r(9) * 10} ${90 - r(10) * 6} ${80 + r(11) * 8} ${64 + r(12) * 8} ${88 + r(13) * 5} C${40 + r(14) * 10} ${98} ${16 + r(15) * 8} ${88} ${10 + r(16) * 6} ${64 + r(17) * 8} C${6} ${50} ${8} ${38} ${14 + r(1) * 10} ${30 + r(2) * 10}Z`;
  return (
    <svg className="paper" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id="pap"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed={h % 50} /><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .33  0 0 0 0 .15  0 0 0 .22 0" /></filter>
        <radialGradient id="vg" cx=".5" cy=".5" r=".75"><stop offset=".55" stopColor="#0000" /><stop offset="1" stopColor="#7a5a2d66" /></radialGradient>
      </defs>
      <rect width="100" height="100" fill="#e3cc94" />
      <rect width="100" height="100" filter="url(#pap)" />
      {world ? (
        <>
          <path d="M6 22C14 8 40 6 58 10c18 3 32 12 36 30 3 16-2 34-10 46-10 12-36 12-56 8C16 90 6 70 6 50z" fill="#c7cf8a" stroke="#7a5a2d" strokeWidth=".6" />
          <path d="M60 8l8 16 8-14 10 20" fill="none" stroke="#7a5a2d" strokeWidth=".6" />
          <path d="M44 30C48 44 52 52 64 60S88 62 92 56" fill="none" stroke="#7fb3c6" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="52" cy="84" rx="12" ry="6" fill="#9ccbd6" stroke="#5a8a9a" strokeWidth=".5" />
          {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={8 + ((i * 37) % 86)} cy={10 + ((i * 53) % 82)} r="1.4" fill="#7a9a54" opacity=".6" />)}
        </>
      ) : (
        <>
          <path d={blob} fill="#d9c27a" stroke="#6b4a1f" strokeWidth=".7" />
          <path d={`M${10 + r(3) * 20} ${70 - r(4) * 20} C${30} ${60} ${50} ${75} ${90} ${50 + r(5) * 20}`} fill="none" stroke="#8cc0d4" strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
          {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={14 + r(i) * 72} cy={20 + r(i + 5) * 66} r={1.3 + r(i + 9) * 1.4} fill="#7da05a" opacity=".7" />)}
        </>
      )}
      <rect width="100" height="100" fill="url(#vg)" />
    </svg>
  );
}

interface Props {
  report: Report | null;
  game: Game | null;
  connected: boolean;
  onHome: () => void;
  start?: string | null;
}

export function MapScreen({ report, game, connected, onHome, start }: Props) {
  const [area, setArea] = useState<string | null>(start ?? null);
  const [sheet, setSheet] = useState<null | "progress" | "completion" | "filter" | "settings">(null);
  const [sel, setSel] = useState<string | null>(null);
  const [prefs, setPrefs] = useLocal("map.prefs", {
    kinds: { chests: true, skulltulas: true, "heart-pieces": true, "heart-containers": true } as Record<MapKind, boolean>,
    incompleteOnly: false, contents: true, showLink: true,
  });
  const rows = useMemo(() => areaRows(report), [report]);
  const ids = rows.map((r) => r.area);
  const linkArea = areaOfMap(game?.map, ids);

  if (!report || rows.length === 0) {
    return (
      <div className="mapwrap" style={{ background: "#0f0b08" }}>
        <div className="map-top" style={{ background: "none" }}>
          <button className="icon-btn" onClick={onHome} aria-label="Home"><Back /></button>
          <Sync on={connected} />
        </div>
        <p className="empty" style={{ marginTop: "5em" }}>
          No save report yet. The map needs the list of chests, Gold Skulltulas and Heart pieces, which is made from your own game files
          (see docs/research/GAME_STATE_AND_SAVE_FORMATS.md). Run the report helper, then reopen this screen.
        </p>
      </div>
    );
  }

  const top = (
    <div className="map-top">
      <button className="icon-btn" onClick={area ? () => { setArea(null); setSel(null); } : onHome} aria-label="Back"><Back /></button>
      <div style={{ display: "flex", alignItems: "center", gap: ".4em" }}>
        <Sync on={connected} />
        <button className="icon-btn" onClick={() => setSheet("settings")} aria-label="Map settings"><Gear /></button>
      </div>
    </div>
  );

  // ---------- World ----------
  if (!area) {
    return (
      <div className="mapwrap">
        <div style={{ position: "absolute", inset: 0, overflowY: "auto", scrollbarWidth: "none" }}>
          <div style={{ position: "relative", height: "230%" }}>
            <Paper seed="world" world />
            {rows.map((r) => {
              const p = WORLD[r.area] ?? { x: 50, y: 50 };
              const done = r.have >= r.of;
              return (
                <button key={r.area} className="cap" style={{ left: `${Math.min(86, Math.max(14, p.x))}%`, top: `${6 + p.y * 0.9}%`, opacity: done ? 0.75 : 1, cursor: "pointer", fontSize: ".72em" }} onClick={() => setArea(r.area)}>
                  {prettyArea(r.area)}
                  <small>{r.have}/{r.of}{done ? " ✓" : ""}</small>
                </button>
              );
            })}
            {linkArea && prefs.showLink && (() => {
              const p = WORLD[linkArea] ?? { x: 50, y: 50 };
              return <div className="link" style={{ left: `${Math.min(86, Math.max(14, p.x)) + 9}%`, top: `${6 + p.y * 0.9 - 1.6}%` }}><LinkArrow /></div>;
            })()}
          </div>
        </div>
        {top}
        <div className="map-title">Hyrule<i /></div>
        <button className="round" style={{ top: "6.4em" }} aria-label="Go to Link" onClick={() => linkArea && setArea(linkArea)}><Locate /></button>
        <button className="pill-map" onClick={() => setSheet("progress")}><Chevron /> Completion Progress {overall(report)}%</button>
        {sheet === "progress" && (
          <Sheet title="Completion Progress" onClose={() => setSheet(null)}>
            <div style={{ textAlign: "center", padding: ".4em 0 1em" }}>
              <div className="big">{overall(report)}%</div>
              <div className="small muted">Area Achievement Rate (chests, skulltulas and hearts, weighted by count)</div>
            </div>
            {[...rows].sort((a, b) => pct(b.have, b.of) - pct(a.have, a.of)).map((r) => (
              <button key={r.area} className="rowline" style={{ width: "100%", background: "none", border: 0, padding: ".9em 1.2em", borderTop: "1px solid #2c2118" }} onClick={() => { setSheet(null); setArea(r.area); }}>
                <b>{prettyArea(r.area)}</b><span className="num">{pct(r.have, r.of)}%</span>
              </button>
            ))}
          </Sheet>
        )}
        {sheet === "settings" && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSheet(null)} />}
      </div>
    );
  }

  // ---------- Area ----------
  const all = entriesFor(report, area);
  const pts = all.filter((e) => e.pos);
  const xs = pts.map((e) => e.pos![0]), zs = pts.map((e) => e.pos![2]);
  const minx = Math.min(...xs, 0), maxx = Math.max(...xs, 1), minz = Math.min(...zs, 0), maxz = Math.max(...zs, 1);
  const spanx = Math.max(maxx - minx, 40), spanz = Math.max(maxz - minz, 40);
  const proj = (p: [number, number, number]) => ({
    left: `${12 + (76 * (p[0] - minx)) / spanx}%`,
    top: `${16 + (56 * (p[2] - minz)) / spanz}%`,
  });
  const shown = all.filter((e) => prefs.kinds[e.kind] && (!prefs.incompleteOnly || e.have < e.of));
  const row = rows.find((r) => r.area === area)!;
  const selected = shown.find((e) => e.id === sel) ?? null;
  const here = linkArea === area && game?.pos ? proj(game.pos) : null;

  return (
    <div className="mapwrap">
      <Paper seed={area} />
      {top}
      <div className="map-title">{prettyArea(area)}<i /></div>
      <button className="round" style={{ top: "6.4em" }} aria-label="Go to Link" onClick={() => linkArea && setArea(linkArea)}><Locate /></button>
      <button className="round" style={{ top: "10.3em" }} aria-label="Display filters" onClick={() => setSheet("filter")}><Filter /></button>
      {shown.map((e) => e.pos && (
        <button key={e.id} className={`mk ${e.id === sel ? "sel" : ""}`} style={proj(e.pos)} onClick={() => setSel(e.id)} aria-label={e.label}>
          <Marker kind={e.kind} done={e.have >= e.of} />
        </button>
      ))}
      {here && prefs.showLink && <div className="link" style={here}><LinkArrow /></div>}
      {shown.length === 0 && <p className="empty" style={{ position: "absolute", top: "40%", left: 0, right: 0, textAlign: "center" }}>Nothing to show with these filters.</p>}
      {!selected && <button className="pill-map" onClick={() => setSheet("completion")}><Chevron /> Area Completion {pct(row.have, row.of)}%</button>}

      {selected && (
        <section className="sheet" style={{ background: "#14100c" }}>
          <div className="grab" />
          <header>
            <span style={{ display: "flex", gap: ".8em", alignItems: "center" }}>
              <span style={{ width: "2.6em", height: "2.6em", display: "inline-block" }}><Marker kind={selected.kind} done={selected.have >= selected.of} /></span>
              <span><div>{prefs.contents ? selected.label.replace(/ in .*? \(/, " (") : KIND_NAME[selected.kind].replace(/s$/, "")}</div>
                <div className="small muted" style={{ fontWeight: 600 }}>{selected.have >= selected.of ? "Complete" : "Not yet"}</div></span>
            </span>
            <button className="x" onClick={() => setSel(null)} aria-label="Close"><Close /></button>
          </header>
          <div className="body">
            <div className="card" style={{ margin: ".4em 1em" }}>
              <h3 style={{ textAlign: "center" }}>Where</h3>
              <div className="rowline small"><span>Area</span><span>{prettyArea(selected.area)}</span></div>
              {selected.pos && <div className="rowline small"><span>Position</span><span>{selected.pos.map((n) => Math.round(n)).join(", ")}</span></div>}
              {selected.note && <div className="rowline small"><span>Note</span><span>{selected.note}</span></div>}
            </div>
          </div>
        </section>
      )}

      {sheet === "completion" && (
        <Sheet title="Area Completion" onClose={() => setSheet(null)}>
          <div style={{ textAlign: "center", padding: ".2em 0 .8em" }}><span style={{ fontWeight: 800 }}>{prettyArea(area)} </span><span className="big" style={{ fontSize: "2em" }}>{pct(row.have, row.of)}%</span></div>
          {MAP_KINDS.filter((k) => row.kinds[k]).map((k) => (
            <div key={k} className="rowline" style={{ padding: ".9em 1.4em", borderTop: "1px solid #2c2118" }}>
              <span style={{ display: "flex", gap: ".7em", alignItems: "center" }}><span style={{ width: "1.8em", height: "1.8em", display: "inline-block" }}><Marker kind={k} /></span>{KIND_NAME[k]}</span>
              <b className="num">{row.kinds[k]![0]}/{row.kinds[k]![1]}</b>
            </div>
          ))}
        </Sheet>
      )}
      {sheet === "filter" && (
        <Sheet title="Display Filters" onClose={() => setSheet(null)}>
          <div style={{ padding: "0 1.2em" }}>
            <div className="small muted" style={{ margin: ".4em 0" }}>Completion Progress</div>
            <Seg items={["Incomplete Only", "All"] as const} value={prefs.incompleteOnly ? "Incomplete Only" : "All"} onChange={(v) => setPrefs({ ...prefs, incompleteOnly: v === "Incomplete Only" })} />
            <div className="small muted" style={{ margin: "1.2em 0 .4em" }}>Display Items</div>
            {MAP_KINDS.map((k) => (
              <div key={k} className="rowline" style={{ padding: ".7em 0" }}>
                <span style={{ display: "flex", gap: ".7em", alignItems: "center" }}><span style={{ width: "1.8em", height: "1.8em", display: "inline-block" }}><Marker kind={k} /></span>{KIND_NAME[k]} <span className="muted small">{cat(report, k)?.entries.filter((e) => e.area === area).length ?? 0}</span></span>
                <Toggle on={prefs.kinds[k]} label={KIND_NAME[k]} onChange={(v) => setPrefs({ ...prefs, kinds: { ...prefs.kinds, [k]: v } })} />
              </div>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === "settings" && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Settings({ prefs, setPrefs, onClose }: {
  prefs: { contents: boolean; showLink: boolean; incompleteOnly: boolean; kinds: Record<MapKind, boolean> };
  setPrefs: (p: typeof prefs) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Map settings" onClose={onClose}>
      <div className="setting"><span>Display contents of treasure chests</span><Toggle on={prefs.contents} label="chest contents" onChange={(v) => setPrefs({ ...prefs, contents: v })} /></div>
      <div className="setting"><span>Display Link on the map</span><Toggle on={prefs.showLink} label="Link" onChange={(v) => setPrefs({ ...prefs, showLink: v })} /></div>
      <p className="note">Positions come from the game's own placement data. The map art is drawn for this app and is not to scale.</p>
    </Sheet>
  );
}
