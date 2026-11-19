import { useState } from "react";
import { Header, RefreshBtn, Tabs } from "../components/chrome";
import { Crest, Ribbon } from "../components/art";
import { cat, prettyArea, type RepEntry, type Report } from "../report";
import type { Entry } from "../model";

const TABS = ["Records", "Rankings"] as const;

export function Hall({ report, entries, onHome }: { report: Report | null; entries: Entry[]; onHome: () => void }) {
  const [open, setOpen] = useState<(RepEntry & { boss: boolean }) | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Records");
  const bosses = (cat(report, "bosses")?.entries ?? []).map((e) => ({ ...e, boss: true }));
  const foes = (cat(report, "enemies")?.entries ?? []).map((e) => ({ ...e, boss: false }));
  const done = (l: { have: number }[]) => l.filter((e) => e.have).length;

  if (open) {
    const fights = entries.filter((e) => e.type === "battle_ended") as Extract<Entry, { type: "battle_ended" }>[];
    return (
      <>
        <Header title={open.label} left="back" onLeft={() => setOpen(null)} right={<RefreshBtn />} sub={open.boss ? "Boss" : "Enemy"} />
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="scroll grain">
          {tab === "Records" ? (
            <>
              <div style={{ textAlign: "center", padding: "1.4em 0 .4em" }}>
                <div style={{ width: "5em", margin: "0 auto" }}><Crest name={open.label} /></div>
                <div className="small muted" style={{ marginTop: ".6em" }}>Status</div>
                <div className="big" style={{ fontSize: "1.8em" }}>{open.have ? "Defeated" : "Not yet"}</div>
                {open.area && <div className="small muted">{prettyArea(open.area)}</div>}
              </div>
              <div className="card">
                <h3>Best time</h3>
                <p className="small muted">The game's own record times are not in the data this app can read yet, so no tier thresholds are shown. They are set per enemy in the original app and were not copied here.</p>
              </div>
            </>
          ) : (
            <>
              <p className="note">Global rankings come from Nintendo's servers and are not available on PC. Your own battle lengths from this session:</p>
              {fights.length === 0 && <p className="empty">No battles recorded yet. Fight something with the bridge on.</p>}
              {fights.map((f, i) => (
                <div key={i} className="rank"><b className="n">{i + 1}</b><span>Battle</span><span className="num">{Math.round(f.secs)} s</span></div>
              ))}
            </>
          )}
        </div>
      </>
    );
  }

  const Row = (e: RepEntry & { boss: boolean }) => (
    <button key={e.id} className={`listcard ${e.have ? "" : "locked"}`} onClick={() => setOpen(e)}>
      <span className="pic"><Crest name={e.label} /></span>
      <span className="mid">{e.have ? e.label : "???"}<div className="time">{e.have ? "Defeated" : "Not yet"}</div></span>
      <Ribbon tier={e.have ? (e.boss ? 3 : 1) : 0} />
    </button>
  );

  return (
    <>
      <Header title="Hall of Foes" onLeft={onHome} right={<RefreshBtn />}
        help="Every enemy kind and boss the game tracks, with whether you have defeated it. Defeat counts are read from your save; the game's rematch times are not available to this app yet." />
      <div className="scroll grain">
        {!report ? <p className="empty">No save report yet.</p> : (
          <>
            <div className="rowline" style={{ margin: "1em 1.2em 0" }}><b>Bosses</b><span className="num">{done(bosses)}/{bosses.length}</span></div>
            {bosses.map(Row)}
            <div className="rowline" style={{ margin: "1.2em 1.2em 0" }}><b>Enemies</b><span className="num">{done(foes)}/{foes.length}</span></div>
            {foes.map(Row)}
          </>
        )}
      </div>
    </>
  );
}
