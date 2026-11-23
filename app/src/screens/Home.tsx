import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as Ic from "../components/icons";
import { Sheet, Sync } from "../components/chrome";
import { WindowPanel } from "../components/WindowControls";
import type { WindowMode } from "../windowMode";
import { friendlyMap, TILES, type LiveState } from "../model";
import tileFrame from "../assets/tiles/frame.png";
import homeBg from "../assets/bg/home.webp";
import logo from "../assets/logo.webp";

/** Tile pictures drawn for this app (`assets/tiles/<tile id>.webp`), shown inside the shared gold frame. Tiles
 *  without one keep their line icon. */
const ART = import.meta.glob<string>("../assets/tiles/*.webp", { eager: true, import: "default" });
const artFor = (id: string) => ART[`../assets/tiles/${id}.webp`];

const GLYPHS: Record<string, () => ReactNode> = {
  GMap: Ic.GMap,
  GScroll: Ic.GScroll,
  GMedal: Ic.GMedal,
  GSkull: Ic.GSkull,
  GTapestry: Ic.GTapestry,
  GCamera: Ic.GCamera,
  GOcarina: Ic.GOcarina,
  GHistory: Ic.GHistory,
  GQuiz: Ic.GQuiz,
  GRumor: Ic.GRumor,
  GChart: Ic.GChart,
  GAmiibo: Ic.GAmiibo,
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

interface Preview {
  path: string;
  exists: boolean;
  already: string | null;
  before: string;
  after: string;
}

/** The two consented actions: turn the bridge on in longshot_env.txt (for every launch), or start the game with it on. */
export function BridgeActions({ s }: { s: LiveState }) {
  const persistent = s.bridge_config_supported !== false;
  const [sheet, setSheet] = useState<null | "enable" | "launch">(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Whether longshot_env.txt already turns the bridge on (read-only check), so the card doesn't offer it twice.
  const [isOn, setIsOn] = useState(false);
  useEffect(() => {
    if (s.mode === "live" || !persistent) return;
    invoke<Preview>("preview_enable_bridge")
      .then((p) => setIsOn(!!p.already))
      .catch(() => setIsOn(false));
  }, [s.mode, msg, persistent]);
  const run = (cmd: string) =>
    invoke<string>(cmd, { confirm: true })
      .then(setMsg)
      .catch((e) => setMsg(String(e)));
  if (s.mode === "live") return null;
  const added = preview ? preview.after.split(/\r?\n/).filter((l) => !preview.before.split(/\r?\n/).includes(l) && l) : [];
  return (
    <>
      <div className="bridge-card">
        <span className="bridge-badge" aria-hidden>
          <Sync on={false} />
        </span>
        <div className="bridge-text">
          <b>
            {isOn
              ? s.mode === "bridge_off"
                ? "Restart Longshot to connect"
                : "Live bridge is on"
              : s.mode === "bridge_off"
                ? "Game running without the bridge"
                : "Live bridge is off"}
          </b>
          <span>
            {!persistent
              ? "Start Longshot from here for live tracking, or configure its local socket as described in the Linux guide."
              : isOn
                ? s.mode === "bridge_off"
                  ? "The bridge is turned on, but this game was started before it was."
                  : "Start Longshot and the app follows Link live."
                : s.mode === "bridge_off"
                  ? "Turn it on, then restart Longshot to follow Link live."
                  : "Turn it on once to follow Link live on every launch."}
          </span>
        </div>
        <div className="bridge-btns">
          {!isOn && persistent && (
            <button
              className="bridge-btn"
              onClick={() => {
                setMsg(null);
                invoke<Preview>("preview_enable_bridge")
                  .then((p) => {
                    setPreview(p);
                    setSheet("enable");
                  })
                  .catch((e) => {
                    setMsg(String(e));
                    setSheet("enable");
                  });
              }}
            >
              Turn on…
            </button>
          )}
          {s.mode === "offline" && (
            <button
              className={`bridge-btn ${isOn ? "" : "ghost"}`}
              onClick={() => {
                setMsg(null);
                setSheet("launch");
              }}
            >
              {isOn ? "Start game…" : "Start game once…"}
            </button>
          )}
        </div>
      </div>
      {sheet === "enable" && (
        <Sheet title="Turn on the bridge" onClose={() => setSheet(null)}>
          <div style={{ padding: "0 1.2em", lineHeight: 1.55, fontSize: ".9em" }}>
            {preview ? (
              <>
                <p>
                  This adds a line to <b>longshot_env.txt</b> in the game folder so Longshot offers its control bridge the next time it starts. The bridge only
                  lets this app read; it can't press buttons or change saves.
                </p>
                <p className="muted small" style={{ margin: ".6em 0 0" }}>
                  {preview.path}
                </p>
                {preview.already ? (
                  <p style={{ color: "var(--amber)" }}>HOS_CONTROL is already set to “{preview.already}”. If the game was started before that, restart it.</p>
                ) : (
                  <>
                    <p className="small muted" style={{ margin: ".8em 0 .2em" }}>
                      {preview.exists ? "The file exists. This line is added:" : "The file does not exist yet. It would contain:"}
                    </p>
                    <pre style={{ background: "#0b0807", padding: ".7em", border: "1px solid #3a2b1d", whiteSpace: "pre-wrap" }}>
                      {added.map((l) => `+ ${l}`).join("\n")}
                    </pre>
                    <p className="small muted">{preview.exists ? "A backup copy of the old file is made first." : ""} You must restart the game afterwards.</p>
                    {!msg && (
                      <button className="btn block" style={{ width: "100%", margin: ".6em 0" }} onClick={() => run("apply_enable_bridge")}>
                        {preview.exists ? "Back up and apply" : "Create the file"}
                      </button>
                    )}
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
            <p>
              This starts Longshot from your game folder with the control bridge on (<b>HOS_CONTROL={s.pipe || "longshot"}</b>, for this launch only) and your
              normal saves. Nothing is changed on disk.
            </p>
            <p className="muted small">
              If you usually start the game from the Longshot Launcher, that works too, but the bridge is off unless you turn it on.
            </p>
            {!msg && (
              <button className="btn block" style={{ width: "100%", margin: ".6em 0" }} onClick={() => run("launch_game")}>
                Start the game
              </button>
            )}
            {msg && <p style={{ color: "var(--teal)" }}>{msg}</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}

export function Home({
  s,
  go,
  fresh,
  locked,
  reportError,
  win,
  setWin,
}: {
  win: WindowMode;
  setWin: (m: WindowMode) => void;
  s: LiveState;
  go: (id: string) => void;
  fresh: string[];
  locked: Record<string, string>;
  reportError: string | null;
}) {
  const [menu, setMenu] = useState(false);
  const [why, setWhy] = useState<{ title: string; text: string } | null>(null);
  const persistent = s.bridge_config_supported !== false;
  const slot = s.saves[0] ?? null;
  const live = s.mode === "live" && s.game;
  const life = live ? s.game!.life : (slot?.life ?? null);
  const max = live ? s.game!.max_life : (slot?.max_life ?? null);
  const rupees = live ? s.game!.rupees : (slot?.rupees ?? null);
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
      {/* A forest painted for this app (not a scene from the game), dimmed behind the tiles. */}
      <div className="bg home-bg" style={{ backgroundImage: `url(${homeBg})` }} aria-hidden />
      <div className="top">
        <img className="logo-mark" src={logo} alt="" draggable={false} />
        <div className="logo">
          OCARINA
          <br />
          JOURNAL
        </div>
        <Sync on={s.connected} />
        <button className="icon-btn" aria-label="More" onClick={() => setMenu(true)}>
          <Ic.Dots />
        </button>
      </div>

      <div className="home-head" style={{ position: "relative", zIndex: 2, padding: ".3em 1.2em 0" }}>
        <div style={{ fontSize: ".78em", color: "#cfe0c0", textShadow: "0 1px 2px #000" }}>{status}</div>
        {life != null && max != null && (
          <div style={{ margin: ".5em 0 1em", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1em" }}>
            <Hearts life={life} max={max} />
            <span className="num" style={{ display: "flex", gap: ".35em", alignItems: "center", fontSize: "1.2em" }}>
              <Ic.Rupee /> {rupees ?? "–"}
            </span>
          </div>
        )}
      </div>

      <BridgeActions s={s} />
      <div className="tgrid">
        {TILES.map((t) => {
          const G = GLYPHS[t.icon];
          return (
            <button
              key={t.id}
              className={`ttile ${t.locked ? "unavailable" : locked[t.id] ? "lock" : ""}`}
              aria-disabled={!!(t.locked || locked[t.id])}
              onClick={() =>
                t.locked
                  ? setWhy({ title: "Not available", text: t.locked })
                  : locked[t.id]
                    ? setWhy({ title: "Not open yet", text: `${locked[t.id]} Your save says it isn't yet.` })
                    : go(t.id)
              }
            >
              {fresh.includes(t.id) && !locked[t.id] && !t.locked && <i className="dot" />}
              {locked[t.id] && !t.locked && (
                <i className="padlock" aria-label="Locked">
                  🔒
                </i>
              )}
              {artFor(t.id) ? (
                <span className="frame art">
                  <img className="art-in" src={artFor(t.id)} alt="" draggable={false} />
                  <img className="art-fr" src={tileFrame} alt="" draggable={false} />
                </span>
              ) : (
                <span className={`frame ${t.dark ? "dark" : ""}`}>
                  <G />
                </span>
              )}
              <span className="c">{t.title}</span>
            </button>
          );
        })}
      </div>

      {why && (
        <Sheet title={why.title} onClose={() => setWhy(null)}>
          <p style={{ padding: "0 1.2em 1.2em", lineHeight: 1.6 }}>{why.text}</p>
        </Sheet>
      )}
      {menu && (
        <Sheet title="Ocarina Journal" onClose={() => setMenu(false)}>
          <div style={{ padding: "0 1.2em", lineHeight: 1.6, fontSize: ".9em" }}>
            <p>
              <b>Mode:</b> {s.mode === "live" ? "Live (bridge connected)" : s.mode === "bridge_off" ? "Game running, bridge off" : "Game not running"}
            </p>
            {s.version && <p className="muted small">{s.version}</p>}
            <p className="muted small" style={{ overflowWrap: "anywhere" }}>
              {persistent ? "Pipe" : "Socket"}: {s.pipe || "longshot"} · saves: {s.save_dir ?? "not found"}
            </p>
            <p className="muted small">Game folder: {s.game_dir ?? "not detected (found when the game runs, or set OJ_GAME)"}</p>
            <p className="small" style={{ color: reportError ? "var(--amber)" : "var(--teal)" }}>
              Names and positions: {reportError ? `unavailable (${reportError})` : "read from your game folder"}
            </p>
            {s.mode === "bridge_off" && (
              <p style={{ marginTop: ".8em" }}>
                Longshot was started without its control bridge. Restart the game with <b>HOS_CONTROL={s.pipe || "longshot"}</b>
                {persistent ? (
                  <>
                    , or add that line to <b>longshot_env.txt</b> in the game folder. This app will not change your files without asking.
                  </>
                ) : (
                  <>, or close it and use Start game from this app. This app will not change your files without asking.</>
                )}
              </p>
            )}
            <WindowPanel mode={win} set={setWin} />
            <p className="muted small" style={{ marginTop: "1em" }}>
              Unofficial companion for Longshot. Not affiliated with or endorsed by Nintendo. Read-only: it never writes to the game or its saves.
            </p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
