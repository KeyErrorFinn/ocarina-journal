import { useState } from "react";
import { Header } from "../components/chrome";
import { friendlyMap, mins, type DaySummary } from "../model";

/** Past days, kept on this PC. A day runs from 05:00 to 04:59. */
export function History({ days, onHome }: { days: DaySummary[]; onHome: () => void }) {
  const [open, setOpen] = useState<DaySummary | null>(null);
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "long", day: "numeric" });

  if (open) {
    const t = open.totals;
    const areas = Object.entries(t.by_area).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const Row = ({ k, v }: { k: string; v: string }) => <div className="rowline sep"><span>{k}</span><b className="num">{v}</b></div>;
    return (
      <>
        <Header title={fmt(open.date)} left="back" onLeft={() => setOpen(null)} sub="History" />
        <div className="scroll grain">
          <div className="card">
            <div className="rowline"><h3>Time played</h3><span className="big" style={{ fontSize: "1.6em" }}>{mins(t.play_secs)}</span></div>
            {areas.map(([a, s]) => <div key={a} className="rowline small"><span>{friendlyMap(a)}</span><span>{mins(s)}</span></div>)}
            <Row k="Areas visited" v={String(t.areas_visited.length)} />
            <Row k="Rupees gained" v={`+${t.rupees_gained}`} />
            <Row k="Rupees spent" v={String(t.rupees_spent)} />
            <Row k="Hearts of damage" v={String(t.damage_quarters / 4)} />
            <Row k="Battles" v={String(t.battles)} />
            <Row k="Times Link fell" v={String(t.deaths)} />
            <Row k="Distance (units)" v={String(Math.round(t.distance_units))} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="History" onLeft={onHome} help="Each finished day with the totals the app recorded while it was open. Days are kept on this PC, up to 120." />
      <div className="scroll grain">
        {days.length === 0 && <p className="empty">No finished days yet. Today's totals appear here after 05:00 tomorrow.</p>}
        {days.map((d) => (
          <button key={d.start_ms} className="listcard" onClick={() => setOpen(d)}>
            <span className="mid" style={{ textAlign: "left" }}>{fmt(d.date)}<div className="time">{mins(d.totals.play_secs)} · {d.totals.areas_visited.length} areas · {d.totals.battles} battles</div></span>
          </button>
        ))}
      </div>
    </>
  );
}
