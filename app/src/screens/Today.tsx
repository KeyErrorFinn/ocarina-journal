import { useState } from "react";
import { Bar, Header, RefreshBtn, Tabs } from "../components/chrome";
import { clock, describe, friendlyMap, mins, type Entry, type Journal, type Mode } from "../model";
import { useMapImage, useMapIndex, type MapIndex } from "../maps";
import { MEDALS } from "../data/content";
import { cat, totalKills, type Report } from "../report";
import { tiersReached } from "./Journey";

/** Paintings for key moments, drawn for this app (src/assets/scenes). Missing ones fall back to a drawn sky. */
const SCENES = import.meta.glob<string>("../assets/scenes/*.webp", { eager: true, import: "default" });
const scene = (k: string) => SCENES[`../assets/scenes/${k}.webp`];
const ZOOM = 3;

const TABS = ["Timeline", "Data"] as const;
const DAY_START_HOUR = 5; // the original app's day runs 05:00 to 04:59; ours does the same by design choice

/** Start of the journal day containing `t`. */
export function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.getTime() > t ? d.getTime() - 86_400_000 : d.getTime();
}

const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
const fmtStamp = (t: number) => new Date(t).toLocaleString([], { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** The game's world map, from the player's own files, zoomed in on where `place` is drawn. */
function MapCrop({ idx, place }: { idx: MapIndex; place: string }) {
  const img = useMapImage(idx.world.image);
  const l = idx.world.labels[place];
  if (!img || !l) return null;
  const ar = img.h / img.w;
  const hx = 0.5 / ZOOM, hy = 9 / 16 / 2 / (ZOOM * ar); // half the visible part, as a fraction of the picture
  const x = Math.min(1 - hx, Math.max(hx, 0.5 + l[0] / idx.world.width));
  const y = Math.min(1 - hy, Math.max(hy, 0.5 - l[1] / idx.world.height));
  return <img className="crop" src={img.url} alt="" style={{ width: `${ZOOM * 100}%`, left: `calc(50% - ${x * ZOOM * 100}%)`, top: `calc(50% - ${y * ZOOM * ar * 100}cqw)` }} />;
}

/** A picture for a key entry: the map where an area was entered, else a painting (the original app uses game
 *  screenshots; capturing them needs a write-capable command). */
function Scene({ e, idx }: { e: Entry; idx: MapIndex | null }) {
  const place = e.type === "area_entered" ? e.entered.split("_")[0] : null;
  const paint = scene(e.type === "max_life_up" ? "heart" : e.type === "died" ? "fell" : e.type === "age_changed" ? "age" : "day");
  if (place && idx?.world.labels[place]) {
    return <div className="shot"><MapCrop idx={idx} place={place} /><span className="shot-tag">{friendlyMap(place)}</span></div>;
  }
  if (paint) return <div className="shot"><img src={paint} alt="" /></div>;
  const hue = e.type === "died" ? 0 : e.type === "area_entered" ? 100 : 40;
  return (
    <div className="shot" style={{ background: `linear-gradient(180deg, hsl(${hue} 35% 30%), hsl(${hue + 40} 40% 14%))` }}>
      <svg viewBox="0 0 160 90" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M0 62l30-24 26 18 30-28 34 26 40-22v62H0z" fill={`hsl(${hue} 30% 22%)`} opacity=".8" />
        <circle cx="132" cy="20" r="8" fill="#fff6d6" opacity=".8" />
      </svg>
    </div>
  );
}

/** Medals closest to their next tier, from the save. */
function InReach({ report }: { report: Report | null }) {
  if (!report) return null;
  const list = MEDALS.map((m) => {
    const v = m.cat === "kills" ? totalKills(report) : cat(report, m.cat)?.have ?? 0;
    const next = m.tiers[tiersReached(v, m.tiers)];
    return { m, v, next };
  }).filter((x) => x.next !== undefined).sort((a, b) => b.v / b.next! - a.v / a.next!).slice(0, 4);
  if (!list.length) return null;
  return (
    <div className="card">
      <h3>Medals in reach</h3>
      {list.map(({ m, v, next }) => (
        <div key={m.id} className="reach">
          <div className="rowline"><b>{m.name}</b><span className="big" style={{ fontSize: "1.3em" }}>{v}</span></div>
          <div className="rowline small muted"><span>Remaining to next tier:</span><span>{next! - v}</span></div>
          <Bar value={v / next!} />
        </div>
      ))}
    </div>
  );
}

export function Today({ onHome, journal, mode, report }: { onHome: () => void; journal: Journal; mode: Mode; report: Report | null }) {
  const idx = useMapIndex();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Timeline");
  const now = Date.now();
  const from = dayStart(now);
  const to = from + 86_400_000 - 60_000;
  const entries = journal.entries.filter((e) => e.wall_ms >= from);
  const t = journal.totals;
  const areas = Object.entries(t.by_area).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const empty = entries.length === 0 && t.play_secs < 1;

  return (
    <>
      <Header title="Today's Journal" onLeft={onHome} right={<RefreshBtn />}
        help="A timeline and totals of what the app saw while it was open. The day runs from 05:00 to 04:59, like the original. Game screenshots are not captured: entering an area shows that spot on your game's world map, and other moments use paintings made for this app." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="scroll grain">
        <h2 className="h2">Records for {fmtDay(from)}</h2>
        {empty ? (
          <p className="empty">
            {mode === "live" ? "Nothing yet. Walk somewhere, fight, or open a chest and it will appear here."
              : mode === "bridge_off" ? "The game is running but the control bridge is off, so there is no live data."
              : "The game is not running. Start Longshot to record a session."}
          </p>
        ) : tab === "Timeline" ? (
          <div className="timeline">
            {entries.map((e, i) => {
              const d = describe(e);
              return (
                <div className="ev" key={`${e.wall_ms}-${i}`}>
                  <i className="node" />
                  <div className="t">{clock(e.wall_ms)}{e.area ? ` · ${friendlyMap(e.area)}` : ""}</div>
                  <div className="title">{d.title}{d.detail ? ` · ${d.detail}` : ""}</div>
                  {d.key && <Scene e={e} idx={idx} />}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <p className="small muted" style={{ margin: "0 1.2em .4em" }}>Last updated just now</p>
            <div className="card">
              <div className="rowline"><h3>Time played</h3><span className="big" style={{ fontSize: "1.6em" }}>{mins(t.play_secs)}</span></div>
              {areas.length > 0 && <div className="muted small">Time by area</div>}
              {areas.map(([a, s]) => <div key={a} className="rowline small"><span>{friendlyMap(a)}</span><span>{mins(s)}</span></div>)}
              <Stat label="Areas visited" value={t.areas_visited.length} />
              <Stat label="Rupees gained" value={t.rupees_gained} plus />
              <Stat label="Rupees spent" value={t.rupees_spent} />
              <Stat label="Hearts of damage taken" value={t.damage_quarters / 4} />
              <Stat label="Battles" value={t.battles} plus />
              <Stat label="Cutscenes and pickups" value={t.scenes} plus />
              <Stat label="Times Link fell" value={t.deaths} />
              <Stat label="Distance walked (units)" value={Math.round(t.distance_units)} plus />
            </div>
            <InReach report={report} />
            <p className="note">
              Data is gathered live while the app is open. Data collected between {fmtStamp(from)} and {fmtStamp(to)}.
              Enemy kills, grass cut and jumps are counted by the game but are not in the live feed.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, plus }: { label: string; value: number; plus?: boolean }) {
  return (
    <div className="rowline sep" style={{ marginTop: ".5em", paddingTop: ".7em" }}>
      <b>{label}</b>
      <span className="big" style={{ fontSize: "1.5em" }}>{plus && value > 0 ? "+" : ""}{value}</span>
    </div>
  );
}
