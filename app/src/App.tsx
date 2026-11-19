import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { EMPTY, TILES, type LiveState } from "./model";
import type { ReportFile } from "./report";
import { Home } from "./screens/Home";
import { Today } from "./screens/Today";
import { Journey } from "./screens/Journey";
import { MapScreen } from "./screens/MapScreen";
import { Rumors } from "./screens/Rumors";
import { Hall } from "./screens/Hall";
import { Compare } from "./screens/Compare";
import { Photos } from "./screens/Photos";
import { Tapestry } from "./screens/Tapestry";
import { Amiibo } from "./screens/Amiibo";
import { Ocarina } from "./screens/Ocarina";
import { Quiz } from "./screens/Quiz";

export function App() {
  const [s, setS] = useState<LiveState>(EMPTY);
  const [rep, setRep] = useState<ReportFile | null>(null);
  // `#today`, `#map:KokiriForest`, `#ocarina:Saria's Song` open a screen directly (handy for review).
  const [route, setRoute] = useState<string>(() => decodeURIComponent(location.hash.slice(1)) || "home");
  const [seen, setSeen] = useState(false);
  const [repErr, setRepErr] = useState<string | null>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    invoke<LiveState>("get_state").then(setS).catch(() => {});
    listen<LiveState>("live-state", (e) => setS(e.payload)).then((f) => (off = f));
    return () => off?.();
  }, []);

  // The save report changes only when someone regenerates it; check now and then.
  useEffect(() => {
    let last = 0;
    const load = () =>
      invoke<ReportFile | null>("get_report").then((r) => {
        setRepErr(null);
        if (r && r.modified_ms !== last) { last = r.modified_ms; setRep(r); }
      }).catch((e) => {
        setRepErr(typeof e === "string" ? e : "The game folder could not be read.");
        // Plain-browser review only: a git-ignored copy of the report.
        if (import.meta.env.DEV && !last) fetch("/dev-report.json").then((r) => r.json()).then((r: ReportFile) => { last = 1; setRep(r); }).catch(() => {});
      });
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const home = () => setRoute("home");
  const [id, arg] = route.split(/:(.*)/s);
  const report = rep?.report ?? null;
  const game = s.game;
  const slotRupees = (s.mode === "live" && game?.rupees != null ? game.rupees : report?.slots.find((x) => x.slot === report.slot)?.rupees ?? s.saves[0]?.rupees) ?? null;

  let body;
  switch (id) {
    case "home":
      body = <Home s={s} reportError={repErr} hasNew={!seen && s.journal.entries.length > 0} go={(t) => { if (t === "today") setSeen(true); setRoute(t); }} />;
      break;
    case "map":
      body = <MapScreen report={report} game={game} connected={s.connected} onHome={home} start={arg} />;
      break;
    case "rumors":
      body = <Rumors report={report} game={game} onHome={home} openSong={(n) => setRoute(`ocarina:${n}`)} />;
      break;
    case "foes":
      body = <Hall report={report} entries={s.journal.entries} onHome={home} />;
      break;
    case "today":
      body = <Today onHome={home} journal={s.journal} mode={s.mode} />;
      break;
    case "journey":
      body = <Journey report={report} rupees={slotRupees} onHome={home} onCompare={() => setRoute("compare")} />;
      break;
    case "compare":
      body = <Compare report={report} journal={s.journal} onHome={home} onBack={() => setRoute("journey")} />;
      break;
    case "photos":
      body = <Photos report={report} onHome={home} />;
      break;
    case "tapestry":
      body = <Tapestry report={report} onHome={home} />;
      break;
    case "amiibo":
      body = <Amiibo onHome={home} />;
      break;
    case "ocarina":
      body = <Ocarina report={report} onHome={home} start={arg} />;
      break;
    case "quiz":
      body = <Quiz onHome={home} />;
      break;
    default:
      body = <p className="empty">Unknown screen "{id}" ({TILES.length} available). <button className="btn" onClick={home}>Home</button></p>;
  }

  return (
    <div className="stage">
      <div className="phone">{body}</div>
    </div>
  );
}
