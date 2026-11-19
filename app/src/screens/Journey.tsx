import { useState } from "react";
import { MedalBadge, Rupee } from "../components/icons";
import { Bar, Header, Note } from "../components/chrome";
import { MEDALS, TIER_NAMES } from "../data/content";
import { useLocal } from "../store";
import { cat, type Report } from "../report";

type Tier = "bronze" | "silver" | "gold" | "locked";
const TIER_KEYS: Tier[] = ["bronze", "silver", "gold"];

/** How many tiers (0..4) a value has reached. Thresholds are this app's own. */
export const tiersReached = (v: number, th: readonly number[]) => th.filter((t) => v >= t).length;
const badgeTier = (n: number): Tier => (n === 0 ? "locked" : TIER_KEYS[Math.min(n, 3) - 1]);

export function Journey({ report, rupees, onHome, onCompare }: { report: Report | null; rupees: number | null; onHome: () => void; onCompare: () => void }) {
  const [name, setName] = useLocal("profile.name", "Adventurer");
  const [avatar] = useLocal<string | null>("profile.avatar", null);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const value = (c: string) => cat(report, c)?.have ?? 0;

  const m = MEDALS.find((x) => x.id === open);
  if (m) {
    const v = value(m.cat);
    const n = tiersReached(v, m.tiers);
    const next = m.tiers.find((t) => v < t);
    return (
      <>
        <Header title={m.name} left="back" onLeft={() => setOpen(null)} sub="Medal" />
        <div className="scroll grain">
          <div style={{ width: "42%", margin: "1.4em auto .4em" }}><MedalBadge tier={badgeTier(n)} glyph={n ? m.glyph : "?"} /></div>
          <p className="small muted" style={{ textAlign: "center" }}>{TIER_NAMES[Math.max(0, n - 1)]} · {m.rule}</p>
          <div className="card">
            <div className="rowline"><span className="muted small">{cat(report, m.cat)?.title ?? m.cat}</span><span className="big" style={{ fontSize: "1.8em" }}>{v}</span></div>
            <div className="rowline small"><span className="muted">{next ? "Remaining to next tier" : "All tiers earned"}</span><b>{next ? next - v : 0}</b></div>
            <Bar value={next ? v / next : 1} />
          </div>
          <button className="btn ghost block" onClick={onCompare}>View Slot Compare</button>
          <h2 className="h2" style={{ fontSize: "1.1em" }}>Medal Status</h2>
          {m.tiers.map((t, i) => (
            <div key={t} className={`tierrow ${v >= t ? "" : "locked"}`}>
              <MedalBadge tier={v >= t ? badgeTier(i + 1) : "locked"} glyph={v >= t ? m.glyph : "?"} />
              <div><b>{TIER_NAMES[i]}</b><div className="small muted" style={{ color: v >= t ? "var(--gold)" : undefined }}>{v >= t ? "Earned" : "Keep at it..."}</div></div>
              <span className="v">{t}</span>
            </div>
          ))}
          <Note>Tiers are this app's own thresholds, not the game's or Nintendo's.</Note>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="My Journey" onLeft={onHome} help="Medals earned from your save: skulltulas, enemy kinds, chests, hearts, songs, bosses and story steps. Thresholds are set by this app." />
      <div className="scroll grain" style={{ paddingBottom: "4em" }}>
        <div className="avatar" aria-hidden>
          {avatar ? <img src={avatar} alt="" /> : (
            <svg viewBox="0 0 48 48" width="60%" fill="none" stroke="#e9f5d8" strokeWidth="2.2" strokeLinecap="round"><circle cx="24" cy="18" r="8" /><path d="M8 42c2-9 9-13 16-13s14 4 16 13" /></svg>
          )}
        </div>
        {edit ? (
          <div style={{ padding: "0 3em" }}>
            <input type="text" value={name} maxLength={20} autoFocus onChange={(e) => setName(e.target.value)} onBlur={() => setEdit(false)} onKeyDown={(e) => e.key === "Enter" && setEdit(false)} />
          </div>
        ) : (
          <button style={{ display: "block", margin: "0 auto", background: "none", border: 0, font: "800 1.2em var(--body)" }} onClick={() => setEdit(true)}>{name}</button>
        )}
        <div className="minimedals" style={{ marginTop: "1.2em" }}>
          {MEDALS.map((x) => <MedalBadge key={x.id} tier={badgeTier(tiersReached(value(x.cat), x.tiers))} glyph={x.glyph} />)}
        </div>
        <div className="medals">
          {MEDALS.map((x) => {
            const v = value(x.cat);
            const n = tiersReached(v, x.tiers);
            const next = x.tiers.find((t) => v < t) ?? x.tiers[3];
            return (
              <button key={x.id} className={`medal ${n === 0 ? "locked" : ""}`} onClick={() => setOpen(x.id)}>
                <MedalBadge tier={badgeTier(n)} glyph={n ? x.glyph : "?"} />
                <b>{n === 0 ? "???" : x.name}</b>
                <Bar value={v / next} />
              </button>
            );
          })}
        </div>
        {!report && <p className="empty">No save report yet; medals fill in once it exists.</p>}
      </div>
      <div className="pinned">
        <span className="muted">Rupees</span>
        <span className="num" style={{ display: "flex", gap: ".4em", alignItems: "center", fontSize: "1.3em" }}><Rupee /> {rupees ?? "–"}</span>
      </div>
    </>
  );
}
