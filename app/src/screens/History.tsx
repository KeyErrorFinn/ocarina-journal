import { useState } from "react";
import { Header } from "../components/chrome";
import { clock, friendlyMap, mins, type DaySummary, type SaveEvent } from "../model";
import type { Report } from "../report";
import { dayStart, gainsText } from "./Today";

/** One day in the list: what the bridge recorded (if it was on) and the saves made that day. */
interface Day { start: number; bridge: DaySummary | null; saves: SaveEvent[] }

/** Days come from two places: the bridge's finished days (kept by the app) and the save log (kept from comparing
 *  saves, so it covers play without the bridge too). Today is left to Today's Journal. */
function days(bridge: DaySummary[], saves: SaveEvent[]): Day[] {
  const today = dayStart(Date.now());
  const by = new Map<number, Day>();
  const day = (start: number) => by.get(start) ?? (by.set(start, { start, bridge: null, saves: [] }).get(start) as Day);
  for (const d of bridge) day(dayStart(d.start_ms)).bridge = d;
  for (const e of saves) {
    const s = dayStart(e.wall_ms);
    if (s !== today) day(s).saves.push(e);
  }
  return [...by.values()].sort((a, b) => b.start - a.start);
}

export function History({ days: bridge, saves, report, onHome }: { days: DaySummary[]; saves: SaveEvent[]; report: Report | null; onHome: () => void }) {
  const [open, setOpen] = useState<Day | null>(null);
  const fmt = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", month: "long", day: "numeric" });
  const list = days(bridge, saves);
  const gained = (d: Day) => {
    const g: Record<string, number> = {};
    for (const e of d.saves) for (const [k, n] of Object.entries(e.gains)) g[k] = (g[k] ?? 0) + n;
    return g;
  };

  if (open) {
    const t = open.bridge?.totals;
    const areas = t ? Object.entries(t.by_area).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
    const g = gained(open);
    const Row = ({ k, v }: { k: string; v: string }) => <div className="rowline sep"><span>{k}</span><b className="num">{v}</b></div>;
    return (
      <>
        <Header title={fmt(open.start)} left="back" onLeft={() => setOpen(null)} sub="History" />
        <div className="scroll grain">
          {Object.keys(g).length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Found that day</h3>
              {Object.entries(g).map(([k, n]) => <Row key={k} k={report?.categories.find((c) => c.id === k)?.title ?? k} v={`+${n}`} />)}
            </div>
          )}
          {t && (
            <div className="card">
              <div className="rowline"><h3>Time played</h3><span className="big" style={{ fontSize: "1.6em" }}>{mins(t.play_secs)}</span></div>
              {areas.map(([a, s]) => <div key={a} className="rowline small"><span>{friendlyMap(a)}</span><span>{mins(s)}</span></div>)}
              <Row k="Areas visited" v={String(t.areas_visited.length)} />
              <Row k="Rupees gained" v={`+${t.rupees_gained}`} />
              <Row k="Rupees spent" v={String(t.rupees_spent)} />
              <Row k="Hearts of damage" v={String(t.damage_quarters / 4)} />
              <Row k="Battles" v={String(t.battles)} />
              <Row k="Times Link fell" v={String(t.deaths)} />
              <Row k="Distance" v={`${(t.distance_units / 1000).toFixed(1)} km`} />
            </div>
          )}
          {open.saves.length > 0 && (
            <>
              <h2 className="h2">Saves</h2>
              <div className="timeline">
                {open.saves.map((e, i) => (
                  <div className="ev" key={i}>
                    <i className="node save" />
                    <div className="t">{clock(e.wall_ms)} · {e.slot.replace("slot_0", "Slot ").replace("slot_", "Slot ")}</div>
                    <div className="title">Saved{e.place ? ` in ${e.place}` : ""}</div>
                    {gainsText(e, report) && <div className="ev-gains">{gainsText(e, report)}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
          {!t && <p className="note">The bridge was off that day, so only what the saves changed is known.</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="History" onLeft={onHome} help="Each past day: what your saves gained (always), and time played, battles and more when the bridge was on. Days run from 05:00 to 04:59 and are kept on this PC." />
      <div className="scroll grain">
        {list.length === 0 && <p className="empty">No past days yet. Days you play appear here from tomorrow, with what each save gained.</p>}
        {list.map((d) => {
          const g = gained(d);
          const found = Object.values(g).reduce((a, n) => a + n, 0);
          const bits = [
            d.bridge ? mins(d.bridge.totals.play_secs) : null,
            d.saves.length ? `${d.saves.length} ${d.saves.length === 1 ? "save" : "saves"}` : null,
            found ? `${found} found` : null,
            d.bridge ? `${d.bridge.totals.battles} battles` : null,
          ].filter(Boolean);
          return (
            <button key={d.start} className="listcard" onClick={() => setOpen(d)}>
              <span className="mid" style={{ textAlign: "left" }}>{fmt(d.start)}<div className="time">{bits.join(" · ")}</div></span>
            </button>
          );
        })}
      </div>
    </>
  );
}
