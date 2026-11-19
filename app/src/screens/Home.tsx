import { useState, type ReactNode } from "react";
import * as Ic from "../components/icons";
import { ForestBg } from "../components/art";
import { Sheet, Sync } from "../components/chrome";
import { friendlyMap, TILES, type LiveState } from "../model";

const GLYPHS: Record<string, () => ReactNode> = {
  GMap: Ic.GMap, GScroll: Ic.GScroll, GMedal: Ic.GMedal, GSkull: Ic.GSkull, GTapestry: Ic.GTapestry, GCamera: Ic.GCamera,
  GOcarina: Ic.GOcarina, GQuiz: Ic.GQuiz, GRumor: Ic.GRumor, GChart: Ic.GChart, GAmiibo: Ic.GAmiibo,
};

export function Hearts({ life, max }: { life: number; max: number }) {
  const total = Math.max(1, Math.round(max / 4));
  return (
    <div className="hearts" style={{ display: "flex", flexWrap: "wrap", gap: ".15em" }} aria-label={`${life / 4} of ${total} hearts`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: "1.35em", height: "1.35em", display: "inline-block" }}>
          <Ic.Heart fill={Math.max(0, Math.min(4, life - i * 4)) / 4} />
        </span>
      ))}
    </div>
  );
}

export function Home({ s, go, hasNew, reportError }: { s: LiveState; go: (id: string) => void; hasNew: boolean; reportError: string | null }) {
  const [menu, setMenu] = useState(false);
  const slot = s.saves[0] ?? null;
  const live = s.mode === "live" && s.game;
  const life = live ? s.game!.life : slot?.life ?? null;
  const max = live ? s.game!.max_life : slot?.max_life ?? null;
  const rupees = live ? s.game!.rupees : slot?.rupees ?? null;
  const status =
    s.mode === "live"
      ? live
        ? `${friendlyMap(s.game!.map)} · ${s.game!.age === "child" ? "Young" : "Adult"} Link`
        : "Linked · waiting for gameplay"
      : s.mode === "bridge_off"
        ? "Game running · bridge off"
        : "Game not running · saved data";
  return (
    <div className="titles">
      <ForestBg />
      <div className="top">
        <span style={{ display: "inline-grid", width: "1.6em" }}><Ic.Grid /></span>
        <b>Titles</b>
        <div className="logo">OCARINA<br />JOURNAL</div>
        <Sync on={s.connected} />
        <button className="icon-btn" aria-label="More" onClick={() => setMenu(true)}><Ic.Dots /></button>
      </div>

      <div style={{ position: "relative", zIndex: 2, padding: ".3em 1.2em 0" }}>
        <div style={{ fontSize: ".78em", color: "#cfe0c0", textShadow: "0 1px 2px #000" }}>{status}</div>
        {life != null && max != null && (
          <div style={{ marginTop: ".5em", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1em" }}>
            <Hearts life={life} max={max} />
            <span className="num" style={{ display: "flex", gap: ".35em", alignItems: "center", fontSize: "1.2em" }}><Ic.Rupee /> {rupees ?? "–"}</span>
          </div>
        )}
      </div>

      <div className="tgrid">
        {TILES.map((t) => {
          const G = GLYPHS[t.icon];
          return (
            <button key={t.id} className={`ttile ${t.locked ? "lock" : ""}`} onClick={() => go(t.id)}>
              {t.id === "today" && hasNew && <i className="dot" />}
              <span className={`frame ${t.dark ? "dark" : ""}`}><G /></span>
              <span className="c">{t.title}</span>
            </button>
          );
        })}
      </div>

      {menu && (
        <Sheet title="Ocarina Journal" onClose={() => setMenu(false)}>
          <div style={{ padding: "0 1.2em", lineHeight: 1.6, fontSize: ".9em" }}>
            <p><b>Mode:</b> {s.mode === "live" ? "Live (bridge connected)" : s.mode === "bridge_off" ? "Game running, bridge off" : "Game not running"}</p>
            {s.version && <p className="muted small">{s.version}</p>}
            <p className="muted small">Pipe: {s.pipe || "longshot"} · saves: {s.save_dir ?? "not found"}</p>
            <p className="muted small">Game folder: {s.game_dir ?? "not detected (found when the game runs, or set OJ_GAME)"}</p>
            <p className="small" style={{ color: reportError ? "var(--amber)" : "var(--teal)" }}>
              Names and positions: {reportError ? `unavailable (${reportError})` : "read from your game folder"}
            </p>
            {s.mode === "bridge_off" && (
              <p style={{ marginTop: ".8em" }}>
                Longshot was started without its control bridge. Restart the game with <b>HOS_CONTROL={s.pipe || "longshot"}</b>, or add
                that line to <b>longshot_env.txt</b> in the game folder. This app will not change your files without asking.
              </p>
            )}
            <p className="muted small" style={{ marginTop: "1em" }}>Unofficial companion for Longshot. Not affiliated with or endorsed by Nintendo. Read-only: it never writes to the game or its saves.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
