import { useEffect, useState } from "react";
import { Bar, Header, RefreshBtn, Seg, Tabs } from "../components/chrome";
import { clock, describe, friendlyMap, type DaySummary, type Entry, type LiveState, type SaveEvent, type Totals } from "../model";
import { BridgeActions } from "./Home";
import { useLocal } from "../store";
import { useMapIndex, type MapIndex } from "../maps";
import { MapCrop } from "../components/MapCrop";
import { MEDALS } from "../data/content";
import { cat, totalKills, type Report } from "../report";

/** A save's changes in words: "+2 Chests · +1 Gold Skulltulas · +45 rupees". */
export function gainsText(e: SaveEvent, report: Report | null): string {
  const parts = Object.entries(e.gains).map(([k, n]) => `+${n} ${cat(report, k)?.title ?? k}`);
  if (e.rupees) parts.push(`${e.rupees > 0 ? "+" : "−"}${Math.abs(e.rupees)} rupees`);
  return parts.join(" · ");
}

/** Timeline lines from the bridge that are worth reading (cutscenes, pick-ups and small heals are left out). */
const SHOWN = new Set<Entry["type"]>(["area_entered", "battle_ended", "rupees_gained", "rupees_spent", "damage_taken", "max_life_up", "died", "age_changed"]);

type Line = { at: number; key: string; title: string; detail?: string; place?: string | null; map?: string | null; e?: Entry };

/** Paintings for key moments, drawn for this app (src/assets/scenes). Missing ones fall back to a drawn sky. */
const SCENES = import.meta.glob<string>("../assets/scenes/*.webp", { eager: true, import: "default" });
const scene = (k: string) => SCENES[`../assets/scenes/${k}.webp`];

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

/** Lifetime tiers for the day's stats. These thresholds are this app's own; the original's are not public. */
const TIERS = {
  minutes: [60, 300, 600, 1200, 3000, 6000, 12000],
  km: [1, 5, 10, 25, 50, 100, 250],
  rupees: [100, 500, 1000, 2500, 5000, 10000, 25000],
  hearts: [10, 50, 100, 250, 500, 1000],
  falls: [1, 5, 10, 25, 50, 100],
  battles: [10, 50, 100, 250, 500, 1000, 2500],
};

/** One stat of the day: today's change, and how far its lifetime total is from the next tier. */
function StatCard({ label, today, unit, total, tiers, fmt = (n) => String(Math.round(n)) }: {
  label: string; today: number; unit?: string; total: number; tiers: readonly number[]; fmt?: (n: number) => string;
}) {
  const n = tiers.find((t) => total < t);
  const prev = [...tiers].reverse().find((t) => total >= t) ?? 0;
  return (
    <div className="dstat">
      <div className="rowline"><b>{label}</b><span className="dval">{today > 0 ? "+" : ""}{fmt(today)}{unit && <small>{unit}</small>}</span></div>
      <div className="dnext">
        <div className="rowline small"><span>Next tier:</span><span>{n === undefined ? "All tiers reached" : `${fmt(n - total)}${unit ? ` ${unit}` : ""} left`}</span></div>
        <Bar value={n === undefined ? 1 : (total - prev) / (n - prev)} />
      </div>
    </div>
  );
}

/** Today's change in a save counter: the first value the app read from the save today is the baseline. */
function useSaveDelta(key: string, value: number | null, day: number): number {
  const [base, setBase] = useLocal<{ day: number; v: number } | null>(`today.base.${key}`, null);
  const fresh = !base || base.day !== day;
  useEffect(() => {
    if (value !== null && fresh) setBase({ day, v: value });
  }, [value, fresh, day, setBase]);
  return value === null || fresh ? 0 : Math.max(0, value - base!.v);
}

const sumAll = (days: DaySummary[], today: Totals, f: (t: Totals) => number) => days.reduce((a, d) => a + f(d.totals), f(today));
const km = (units: number) => units / 1000; // map positions are in metres (see maps.rs), so one unit is a metre [I]

export function Today({ onHome, s, report }: { onHome: () => void; s: LiveState; report: Report | null }) {
  const { journal, history, mode } = s;
  const idx = useMapIndex();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Timeline");
  const now = Date.now();
  const from = dayStart(now);
  const to = from + 86_400_000 - 60_000;
  const entries = journal.entries.filter((e) => e.wall_ms >= from);
  const saves = (s.save_log ?? []).filter((e) => e.wall_ms >= from);
  const lines: Line[] = [
    ...entries.filter((e) => SHOWN.has(e.type)).map((e, i) => { const d = describe(e); return { at: e.wall_ms, key: `b${i}`, title: d.title, detail: d.detail, place: e.area, e: d.key ? e : undefined }; }),
    ...saves.map((e, i) => ({ at: e.wall_ms, key: `s${i}`, title: `Saved${e.place ? ` in ${e.place}` : ""}`, detail: gainsText(e, report) || undefined, map: e.map })),
  ].sort((a, b) => b.at - a.at);
  const gained: Record<string, number> = {};
  for (const e of saves) for (const [k, n] of Object.entries(e.gains)) gained[k] = (gained[k] ?? 0) + n;
  const t = journal.totals;
  const [age, setAge] = useState<"Child" | "Adult">("Child");
  const byAge = t.by_age_area?.[age.toLowerCase()];
  const areas = Object.entries(t.by_age_area ? byAge ?? {} : t.by_area).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const kills = useSaveDelta("kills", report ? totalKills(report) : null, from);
  const chests = useSaveDelta("chests", report ? cat(report, "chests")?.have ?? 0 : null, from);
  const killTiers = MEDALS.find((m) => m.id === "kills")!.tiers, chestTiers = MEDALS.find((m) => m.id === "chests")!.tiers;
  const life = (f: (t: Totals) => number) => sumAll(history, t, f);
  const updated = Math.max(journal.entries[0]?.wall_ms ?? 0, saves[0]?.wall_ms ?? 0) || (t.play_secs > 0 ? now : null);
  const empty = lines.length === 0 && t.play_secs < 1;

  return (
    <>
      <Header title="Today's Journal" onLeft={onHome} right={<RefreshBtn />}
        help="What changed today. Every time the game saves, the app notes what the save gained (chests, Gold Skulltulas, rupees and so on), even if the app was closed while you played. With the bridge on, it also keeps a live timeline: areas, fights, damage and rupees. The day runs from 05:00 to 04:59, like the original." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="scroll grain">
        <h2 className="h2">Records for {fmtDay(from)}</h2>
        {empty ? (
          <div className="empty" style={{ textAlign: "left" }}>
            <p style={{ margin: "0 0 .8em" }}>
              {mode === "live" ? "Nothing yet. Walk somewhere, fight, or open a chest and it will appear here."
                : "Nothing recorded today yet. From now on, each time the game saves, what the save gained appears here, even if this app was closed while you played."}
            </p>
            {mode !== "live" && <p className="small muted" style={{ margin: 0 }}>For a live timeline as well (areas, fights, damage and rupees as they happen), turn on the bridge once below; it then stays on for every launch.</p>}
          </div>
        ) : tab === "Timeline" ? (
          <div className="timeline">
            {lines.map((l) => {
              const place = l.map ? l.map.split("_")[0] : null;
              return (
                <div className="ev" key={l.key}>
                  <i className={`node ${l.key[0] === "s" ? "save" : ""}`} />
                  <div className="t">{clock(l.at)}{l.place ? ` · ${friendlyMap(l.place)}` : ""}</div>
                  <div className="title">{l.title}{l.e && l.detail ? ` · ${l.detail}` : ""}</div>
                  {!l.e && l.detail && <div className="ev-gains">{l.detail}</div>}
                  {l.e && <Scene e={l.e} idx={idx} />}
                  {!l.e && place && idx?.world.labels[place] && <div className="shot"><MapCrop idx={idx} place={place} /><span className="shot-tag">{friendlyMap(place)}</span></div>}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <p className="small muted" style={{ margin: "-.6em 1.2em .6em" }}>Last updated: {updated ? fmtStamp(updated) : "not yet"}</p>
            <div className="card dcard">
              <StatCard label="Play Time" today={t.play_secs / 60} unit="minutes" total={life((x) => x.play_secs / 60)} tiers={TIERS.minutes} />
              <div className="small muted" style={{ margin: ".9em 0 .4em" }}>Time Spent by Area</div>
              {t.by_age_area && <Seg items={["Child", "Adult"] as const} value={age} onChange={setAge} />}
              {areas.length === 0 && <p className="small muted">{t.by_age_area ? `No time as ${age.toLowerCase()} Link today.` : "No time recorded yet."}</p>}
              {areas.map(([a, sec]) => <div key={a} className="rowline small" style={{ marginTop: ".35em" }}><span>{friendlyMap(a)}</span><span>+{Math.round(sec / 60)} minutes</span></div>)}
              {report && <StatCard label="Enemies Defeated" today={kills} total={totalKills(report)} tiers={killTiers} />}
              {report && <StatCard label="Treasure Chests Opened" today={Math.max(chests, gained.chests ?? 0)} total={cat(report, "chests")?.have ?? 0} tiers={chestTiers} />}
              {Object.entries(gained).filter(([k]) => k !== "chests").map(([k, n]) => (
                <div className="dstat" key={k}><div className="rowline"><b>{cat(report, k)?.title ?? k}</b><span className="dval">+{n}</span></div></div>
              ))}
              <StatCard label="Battles" today={t.battles} total={life((x) => x.battles)} tiers={TIERS.battles} />
              <StatCard label="Game Over Count" today={t.deaths} total={life((x) => x.deaths)} tiers={TIERS.falls} />
              <StatCard label="Hearts Lost" today={t.damage_quarters / 4} total={life((x) => x.damage_quarters / 4)} tiers={TIERS.hearts} fmt={(n) => String(Math.round(n * 4) / 4)} />
              <StatCard label="Rupees Earned" today={t.rupees_gained} total={life((x) => x.rupees_gained)} tiers={TIERS.rupees} />
              <StatCard label="Rupees Spent" today={t.rupees_spent} total={life((x) => x.rupees_spent)} tiers={TIERS.rupees} />
              <StatCard label="Distance Traveled" today={km(t.distance_units)} unit="km" total={life((x) => km(x.distance_units))} tiers={TIERS.km} fmt={(n) => n.toFixed(1)} />
            </div>
            <p className="note">
              Between {fmtStamp(from)} and {fmtStamp(to)}. Play time, battles, damage, distance and rupees come from the
              bridge while it is on; the rest comes from comparing your saves, so it counts even when the app was closed. Tiers and lifetime totals are this app's own, from
              the days it has recorded. Grass cut, rolls and items used have no known source in the game's data yet.
            </p>
          </>
        )}
        {mode !== "live" && <BridgeActions s={s} />}
      </div>
    </>
  );
}
