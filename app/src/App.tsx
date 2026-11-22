import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { EMPTY, TILES, type LiveState } from "./model";
import { cat, setPlaceNames, type Report, type ReportFile } from "./report";
import { useLocal } from "./store";
import { useLore } from "./lore";
import { Home } from "./screens/Home";
import { Today } from "./screens/Today";
import { Journey } from "./screens/Journey";
import { MapScreen } from "./screens/MapScreen";
import { Rumors } from "./screens/Rumors";
import { Hall } from "./screens/Hall";
import { Compare } from "./screens/Compare";
import { Tapestry } from "./screens/Tapestry";
import { Ocarina } from "./screens/Ocarina";
import { Quiz } from "./screens/Quiz";
import { History } from "./screens/History";

export function App() {
  // Place names everywhere follow the game's own text once it has been read from the game folder.
  const lore = useLore();
  if (lore) setPlaceNames(lore.places);
  const [s, setS] = useState<LiveState>(EMPTY);
  const [rep, setRep] = useState<ReportFile | null>(null);
  // `#today`, `#map:KokiriForest`, `#ocarina:Saria's Song` open a screen directly (handy for review).
  const [route, setRoute] = useState<string>(() => decodeURIComponent(location.hash.slice(1)) || "home");
  const [seen, setSeen] = useLocal<Record<string, string>>("home.seen", {});
  const [repErr, setRepErr] = useState<string | null>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    invoke<LiveState>("get_state")
      .then(setS)
      .catch(() => {});
    listen<LiveState>("live-state", (e) => setS(e.payload)).then((f) => (off = f));
    return () => off?.();
  }, []);

  // The save report changes only when someone regenerates it; check now and then.
  useEffect(() => {
    let last = 0;
    const load = () =>
      invoke<ReportFile | null>("get_report")
        .then((r) => {
          setRepErr(null);
          if (r && r.modified_ms !== last) {
            last = r.modified_ms;
            setRep(r);
          }
        })
        .catch((e) => {
          setRepErr(typeof e === "string" ? e : "The game folder could not be read.");
          // Plain-browser review only: a git-ignored copy of the report.
          if (import.meta.env.DEV && !last)
            fetch("/.local/dev-report.json")
              .then((r) => r.json())
              .then((r: ReportFile) => {
                last = 1;
                setRep(r);
              })
              .catch(() => {});
        });
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const home = () => setRoute("home");
  const [id, arg] = route.split(/:(.*)/s);
  const report = rep?.report ?? null;
  const game = s.game;
  const slotRupees =
    (s.mode === "live" && game?.rupees != null ? game.rupees : (report?.slots.find((x) => x.slot === report.slot)?.rupees ?? s.saves[0]?.rupees)) ?? null;

  // "New" dots, as in the original: a tile shows one when what it reads has changed since the player last opened it.
  const sigs = tileSignatures(report, s.journal.entries.length);
  const fresh = Object.keys(sigs).filter((t) => seen[t] !== undefined && seen[t] !== sigs[t]);
  useEffect(() => {
    const first = Object.keys(sigs).filter((t) => seen[t] === undefined);
    if (first.length) setSeen({ ...seen, ...Object.fromEntries(first.map((t) => [t, sigs[t]])) });
  });
  const locked: Record<string, string> = report?.hall_open === false ? { foes: "Opens once the owl has told Link about the Hall of Fallen Foes." } : {};

  let body;
  switch (id) {
    case "home":
      body = (
        <Home
          s={s}
          reportError={repErr}
          fresh={fresh}
          locked={locked}
          go={(t) => {
            if (sigs[t] !== undefined) setSeen({ ...seen, [t]: sigs[t] });
            setRoute(t);
          }}
        />
      );
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
      body = <Today onHome={home} s={s} report={report} />;
      break;
    case "journey":
      body = <Journey report={report} rupees={slotRupees} onHome={home} onCompare={() => setRoute("compare")} />;
      break;
    case "compare":
      body = <Compare report={report} journal={s.journal} onHome={home} onBack={() => setRoute("journey")} />;
      break;
    case "history":
      body = <History days={s.history} saves={s.save_log ?? []} report={report} onHome={home} />;
      break;
    case "tapestry":
      body = <Tapestry report={report} onHome={home} />;
      break;
    case "ocarina":
      body = <Ocarina report={report} onHome={home} start={arg} />;
      break;
    case "quiz":
      body = <Quiz onHome={home} />;
      break;
    default:
      body = (
        <p className="empty">
          Unknown screen "{id}" ({TILES.length} available).{" "}
          <button className="btn" onClick={home}>
            Home
          </button>
        </p>
      );
  }

  return (
    <div className="stage">
      <div className="phone">{body}</div>
    </div>
  );
}

/** What each tile shows, boiled down to a string; a change lights the tile's "new" dot. */
function tileSignatures(r: Report | null, entries: number): Record<string, string> {
  const have = (id: string) => cat(r, id)?.have ?? 0;
  const out: Record<string, string> = { today: String(entries) };
  if (!r) return out;
  out.map = ["chests", "skulltulas", "heart-pieces", "heart-containers"].map(have).join(",");
  out.foes = `${have("enemies")},${have("bosses")},${(r.hall ?? []).filter((h) => h.recorded).length}`;
  out.journey = ["skulltulas", "enemies", "chests", "hearts", "heart-pieces", "songs", "bosses", "story"].map(have).join(",");
  out.tapestry = String(have("story") + have("side-quests"));
  out.ocarina = String(have("songs"));
  return out;
}
