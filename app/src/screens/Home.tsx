import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as Ic from "../components/icons";
import { ForestBg } from "../components/art";
import { Sheet, Sync } from "../components/chrome";
import { friendlyMap, TILES, type LiveState } from "../model";
import tileFrame from "../assets/tiles/frame.png";

/** Tile pictures drawn for this app (`assets/tiles/<tile id>.webp`), shown inside the shared gold frame. Tiles
 *  without one keep their line icon. */
const ART = import.meta.glob<string>("../assets/tiles/*.webp", { eager: true, import: "default" });
const artFor = (id: string) => ART[`../assets/tiles/${id}.webp`];

const GLYPHS: Record<string, () => ReactNode> = {
  GMap: Ic.GMap, GScroll: Ic.GScroll, GMedal: Ic.GMedal, GSkull: Ic.GSkull, GTapestry: Ic.GTapestry, GCamera: Ic.GCamera,
  GOcarina: Ic.GOcarina, GHistory: Ic.GHistory, GQuiz: Ic.GQuiz, GRumor: Ic.GRumor, GChart: Ic.GChart, GAmiibo: Ic.GAmiibo,
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

interface Preview { path: string; exists: boolean; already: string | null; before: string; after: string }

/** The two consented actions: turn the bridge on in longshot_env.txt, or start the game with it on. */
function Actions({ s }: { s: LiveState }) {
  const [sheet, setSheet] = useState<null | "enable" | "launch">(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (cmd: string) => invoke<string>(cmd, { confirm: true }).then(setMsg).catch((e) => setMsg(String(e)));
  if (s.mode === "live") return null;
  const added = preview ? preview.after.split(/\r?\n/).filter((l) => !preview.before.split(/\r?\n/).includes(l) && l) : [];
  return (
    <>
      <div style={{ padding: "0 1em .8em", position: "relative", zIndex: 2 }}>
        {s.mode === "bridge_off" ? (
          <button className="btn block" style={{ margin: 0, width: "100%" }} onClick={() => { setMsg(null); invoke<Preview>("preview_enable_bridge").then((p) => { setPreview(p); setSheet("enable"); }).catch((e) => { setMsg(String(e)); setSheet("enable"); }); }}>
            Turn on the bridge…
          </button>
        ) : (
          <button className="btn block" style={{ margin: 0, width: "100%" }} onClick={() => { setMsg(null); setSheet("launch"); }}>Start Longshot with the bridge…</button>
        )}
      </div>
      {sheet === "enable" && (
        <Sheet title="Turn on the bridge" onClose={() => setSheet(null)}>
          <div style={{ padding: "0 1.2em", lineHeight: 1.55, fontSize: ".9em" }}>
            {preview ? (
              <>
                <p>This adds a line to <b>longshot_env.txt</b> in the game folder so Longshot offers its control bridge the next time it starts. The bridge only lets this app read; it can't press buttons or change saves.</p>
                <p className="muted small" style={{ margin: ".6em 0 0" }}>{preview.path}</p>
                {preview.already ? (
                  <p style={{ color: "var(--amber)" }}>HOS_CONTROL is already set to “{preview.already}”. If the game was started before that, restart it.</p>
                ) : (
                  <>
                    <p className="small muted" style={{ margin: ".8em 0 .2em" }}>{preview.exists ? "The file exists. This line is added:" : "The file does not exist yet. It would contain:"}</p>
                    <pre style={{ background: "#0b0807", padding: ".7em", border: "1px solid #3a2b1d", whiteSpace: "pre-wrap" }}>{added.map((l) => `+ ${l}`).join("\n")}</pre>
                    <p className="small muted">{preview.exists ? "A backup copy of the old file is made first." : ""} You must restart the game afterwards.</p>
                    {!msg && <button className="btn block" style={{ width: "100%", margin: ".6em 0" }} onClick={() => run("apply_enable_bridge")}>{preview.exists ? "Back up and apply" : "Create the file"}</button>}
                  </>
                )}
              </>
            ) : null}
            {msg && <p style={{ color: "var(--teal)" }}>{msg}</p>}
          </div>
        </Sheet>
      )}
      {sheet === "launch" && (
        <Sheet title="Start Longshot" onClose={() => setSheet(null)}>
          <div style={{ padding: "0 1.2em", lineHeight: 1.55, fontSize: ".9em" }}>
            <p>This starts <b>longshot.exe</b> from your game folder with the control bridge on (<b>HOS_CONTROL={s.pipe || "longshot"}</b>, for this launch only) and your normal saves. Nothing is changed on disk.</p>
            <p className="muted small">If you usually start the game from the Longshot Launcher, that works too, but the bridge is off unless you turn it on.</p>
            {!msg && <button className="btn block" style={{ width: "100%", margin: ".6em 0" }} onClick={() => run("launch_game")}>Start the game</button>}
            {msg && <p style={{ color: "var(--teal)" }}>{msg}</p>}
          </div>
        </Sheet>
      )}
    </>
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

      <Actions s={s} />
      <div className="tgrid">
        {TILES.map((t) => {
          const G = GLYPHS[t.icon];
          return (
            <button key={t.id} className={`ttile ${t.locked ? "lock" : ""}`} onClick={() => go(t.id)}>
              {t.id === "today" && hasNew && <i className="dot" />}
              {artFor(t.id) ? (
                <span className="frame art">
                  <img className="art-in" src={artFor(t.id)} alt="" draggable={false} />
                  <img className="art-fr" src={tileFrame} alt="" draggable={false} />
                </span>
              ) : (
                <span className={`frame ${t.dark ? "dark" : ""}`}><G /></span>
              )}
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
