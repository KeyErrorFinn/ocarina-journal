import { useState } from "react";
import { Rupee } from "../components/icons";
import { Bar, Header, Note } from "../components/chrome";
import { MEDALS, TIER_NAMES } from "../data/content";
import { useLocal } from "../store";
import { cat, totalKills, type Report } from "../report";

import { Medal, PORTRAIT, type Tier } from "../components/medals";

const TIER_KEYS: Tier[] = ["bronze", "silver", "gold", "master"];

/** How many tiers (0..4) a value has reached. Thresholds are this app's own. */
export const tiersReached = (v: number, th: readonly number[]) => th.filter((t) => v >= t).length;
const badgeTier = (n: number): Tier => (n === 0 ? "locked" : TIER_KEYS[Math.min(n, 4) - 1]);

export function Journey({ report, rupees, onHome, onCompare }: { report: Report | null; rupees: number | null; onHome: () => void; onCompare: () => void }) {
  const [name, setName] = useLocal("profile.name", "Adventurer");
  const [avatar, setAvatar] = useLocal<string | null>("profile.avatar", null);
  // "You are known for...": the enemy this save has defeated most, as the original's play data names it.
  const top = [...(cat(report, "enemies")?.entries ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
  const pick = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      // (scaled down to keep the stored picture small)
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const s = Math.min(img.width, img.height);
        c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
        setAvatar(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
  };
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const value = (c: string) => (c === "kills" ? totalKills(report) : (cat(report, c)?.have ?? 0));

  const m = MEDALS.find((x) => x.id === open);
  if (m) {
    const v = value(m.cat);
    const n = tiersReached(v, m.tiers);
    const next = m.tiers.find((t) => v < t);
    return (
      <>
        <Header title={m.name} left="back" onLeft={() => setOpen(null)} sub="Medal" />
        <div className="scroll grain">
          <div style={{ width: "42%", margin: "1.4em auto .4em" }}>
            <Medal id={m.id} tier={badgeTier(n)} glyph={m.glyph} />
          </div>
          <p className="small muted" style={{ textAlign: "center" }}>
            {TIER_NAMES[Math.max(0, n - 1)]} · {m.rule}
          </p>
          <div className="card">
            <div className="rowline">
              <span className="muted small">{m.cat === "kills" ? "Enemies defeated" : (cat(report, m.cat)?.title ?? m.cat)}</span>
              <span className="big" style={{ fontSize: "1.8em" }}>
                {v}
              </span>
            </div>
            <div className="rowline small">
              <span className="muted">{next ? "Remaining to next tier" : "All tiers earned"}</span>
              <b>{next ? next - v : 0}</b>
            </div>
            <Bar value={next ? v / next : 1} />
          </div>
          <button className="btn ghost block" onClick={onCompare}>
            View Slot Compare
          </button>
          <h2 className="h2" style={{ fontSize: "1.1em" }}>
            Medal Status
          </h2>
          {m.tiers.map((t, i) => (
            <div key={t} className={`tierrow ${v >= t ? "" : "locked"}`}>
              <Medal id={m.id} tier={v >= t ? badgeTier(i + 1) : "locked"} glyph={m.glyph} />
              <div>
                <b>{TIER_NAMES[i]}</b>
                <div className="small muted" style={{ color: v >= t ? "var(--gold)" : undefined }}>
                  {v >= t ? "Earned" : "Keep at it..."}
                </div>
              </div>
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
      <Header
        title="My Journey"
        onLeft={onHome}
        help="Medals earned from your save: skulltulas, enemy kinds, chests, hearts, songs, bosses and story steps. Thresholds are set by this app."
      />
      <div className="scroll grain" style={{ paddingBottom: "4em" }}>
        <label className="avatar" title="Change your picture">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) pick(f);
            }}
          />
          <i className="edit" aria-label="Change picture">
            ✎
          </i>
          {avatar || PORTRAIT ? (
            <img src={avatar ?? PORTRAIT} alt="" />
          ) : (
            <svg viewBox="0 0 48 48" width="60%" fill="none" stroke="#e9f5d8" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="24" cy="18" r="8" />
              <path d="M8 42c2-9 9-13 16-13s14 4 16 13" />
            </svg>
          )}
        </label>
        {edit ? (
          <div style={{ padding: "0 3em" }}>
            <input
              type="text"
              value={name}
              maxLength={20}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setEdit(false)}
              onKeyDown={(e) => e.key === "Enter" && setEdit(false)}
            />
          </div>
        ) : (
          <button style={{ display: "block", margin: "0 auto", background: "none", border: 0, font: "800 1.2em var(--body)" }} onClick={() => setEdit(true)}>
            {name}
          </button>
        )}
        {top?.count ? (
          <p className="known">
            You are known for... <b>Defeating {top.label}</b> <span className="muted">×{top.count}</span>
          </p>
        ) : null}
        <div className="minimedals" style={{ marginTop: "1.2em" }}>
          {MEDALS.map((x) => (
            <Medal key={x.id} id={x.id} tier={badgeTier(tiersReached(value(x.cat), x.tiers))} glyph={x.glyph} />
          ))}
        </div>
        <div className="medals">
          {MEDALS.map((x) => {
            const v = value(x.cat);
            const n = tiersReached(v, x.tiers);
            const next = x.tiers.find((t) => v < t) ?? x.tiers[3];
            return (
              <button key={x.id} className={`medal ${n === 0 ? "locked" : ""}`} onClick={() => setOpen(x.id)}>
                <span className="medal-tile">
                  <Medal id={x.id} tier={badgeTier(n)} glyph={x.glyph} />
                  <Bar value={v / next} />
                </span>
                <b>{n === 0 ? "???" : x.name}</b>
              </button>
            );
          })}
        </div>
        {!report && <p className="empty">No save report yet; medals fill in once it exists.</p>}
      </div>
      <div className="pinned">
        <span className="muted">Rupees</span>
        <span className="num" style={{ display: "flex", gap: ".4em", alignItems: "center", fontSize: "1.3em" }}>
          <Rupee /> {rupees ?? "–"}
        </span>
      </div>
    </>
  );
}
