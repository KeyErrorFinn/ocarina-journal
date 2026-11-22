import { useState } from "react";
import { Header, RefreshBtn } from "../components/chrome";
import type { Report } from "../report";
import { cat } from "../report";
import { prettyArea } from "../report";
import type { Journal } from "../model";

const STATS: { id: string; title: string }[] = [
  { id: "skulltulas", title: "Gold Skulltulas" },
  { id: "enemies", title: "Kinds of enemies defeated" },
  { id: "chests", title: "Chests opened" },
  { id: "heart-pieces", title: "Heart pieces" },
  { id: "bosses", title: "Bosses beaten" },
  { id: "songs", title: "Songs learned" },
];

/** The original's "Global Play Data" compares you with every player; that needs Nintendo's servers.
 *  This screen compares your own save slots with each other instead. */
export function Compare({ report, journal, onHome, onBack }: { report: Report | null; journal: Journal; onHome: () => void; onBack: () => void }) {
  const [openId, setOpenId] = useState<string | null>("skulltulas");
  const slots = report?.slots ?? [];
  const best = cat(report, "story");
  const known = (() => {
    const rows = (report?.categories ?? []).filter((c) => c.of > 0 && c.counted).map((c) => ({ t: c.title, p: c.have / c.of }));
    return rows.sort((a, b) => b.p - a.p)[0];
  })();
  const topArea = Object.entries(journal.totals.by_area).sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <Header
        title="Slot Compare"
        onLeft={onHome}
        right={<RefreshBtn />}
        help="Compares your six save slots. The original app compares you with all players using Nintendo's servers; that data is not available here, so this uses only your own saves."
      />
      <div className="scroll grain">
        {!report && <p className="empty">No save report yet.</p>}
        {slots.length > 0 && <h2 className="h2">Combat and collecting</h2>}
        {STATS.map((s) => {
          const vals = slots.map((x) => x.totals[s.id]?.[0] ?? 0);
          const max = Math.max(1, ...vals);
          const mine = vals[slots.findIndex((x) => x.slot === report?.slot)] ?? 0;
          const on = openId === s.id;
          return (
            <div key={s.id} className="card" style={{ margin: ".8em 1em" }}>
              <button
                style={{ display: "flex", justifyContent: "space-between", width: "100%", background: "none", border: 0, alignItems: "baseline" }}
                onClick={() => setOpenId(on ? null : s.id)}
              >
                <b>{s.title}</b>
                <span className="big" style={{ fontSize: "1.7em" }}>
                  {mine}
                </span>
              </button>
              {on && (
                <>
                  <div className="hist" style={{ marginTop: "1em" }}>
                    {slots.map((x, i) => (
                      <i
                        key={x.slot}
                        className={x.slot === report?.slot ? "me" : ""}
                        style={{ height: `${Math.max(8, (vals[i] / max) * 100)}%` }}
                        title={`${x.slot}: ${vals[i]}`}
                      />
                    ))}
                  </div>
                  <div className="hist" style={{ height: "auto", marginTop: ".4em" }}>
                    {slots.map((x, i) => (
                      <span key={x.slot} style={{ flex: 1, textAlign: "center", fontSize: ".66em", color: "var(--muted)" }}>
                        {x.slot.replace("slot_", "#")}
                        <br />
                        {vals[i]}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {report && (
          <>
            <h2 className="h2">You are known for...</h2>
            <div className="card">
              {known && (
                <div className="rowline">
                  <span className="muted">Most complete</span>
                  <b className="num">{known.t}</b>
                </div>
              )}
              {topArea && (
                <div className="rowline">
                  <span className="muted">Most time this session</span>
                  <b className="num">{prettyArea(topArea[0].split("_")[0])}</b>
                </div>
              )}
              {best && (
                <div className="rowline">
                  <span className="muted">Story</span>
                  <b className="num">
                    {best.have}/{best.of}
                  </b>
                </div>
              )}
            </div>
          </>
        )}
        <button className="pillbtn" style={{ margin: "1em auto 2em", display: "flex" }} onClick={onBack}>
          ‹ Return to My Journey
        </button>
      </div>
    </>
  );
}
