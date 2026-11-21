import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Header } from "../components/chrome";
import { cat, type RepEntry, type Report } from "../report";
import { useMapImage } from "../maps";
import { PanZoom } from "./MapScreen";

/** The game's own tapestry, read by the backend from the player's game folder (crates/oj-gamedata/src/tapestry.rs). */
/** `path`: the woven outline; `shadow`: the silhouette's, which can differ (null: the game has no silhouette). */
interface Section { name: string; path: string; shadow: string | null; bounds: [number, number, number, number] }
interface TapestryIndex { width: number; height: number; sections: Section[] }

type Look = "woven" | "shadow" | "empty";

let indexPromise: Promise<TapestryIndex | null> | null = null;

function useTapestry(): TapestryIndex | null | undefined {
  const [t, setT] = useState<TapestryIndex | null | undefined>(undefined);
  useEffect(() => {
    indexPromise ??= invoke<TapestryIndex>("get_tapestry").catch(() => {
      indexPromise = null;
      return null;
    });
    let live = true;
    indexPromise.then((i) => live && setT(i));
    return () => {
      live = false;
    };
  }, []);
  return t;
}

/** The quest behind a section, from any category of the report (story or side quests). */
function questOf(r: Report | null, name: string): RepEntry | undefined {
  for (const c of r?.categories ?? []) {
    const e = c.entries.find((e) => e.id === `${c.id}/${name}`);
    if (e) return e;
  }
  return undefined;
}

/** How a section looks for this save. Woven once its quest is complete; a silhouette once it has started (its step is
 *  past `Ready`). Which state the game shows as a silhouette is our reading, not checked against the game [I].
 *  `GameClear` (the bottom band) is woven once Ganon is defeated [I]. */
function lookOf(r: Report | null, s: Section): Look {
  const q = questOf(r, s.name === "GameClear" ? "Defeat_Ganon" : s.name);
  if (!q) return "empty";
  if (q.have) return "woven";
  return s.shadow && q.step && q.step !== "Ready" && q.step !== "None" ? "shadow" : "empty";
}

const nice = (name: string, r: Report | null) =>
  name === "GameClear" ? "The End" : questOf(r, name)?.label ?? name.replace(/^SubEvent_/, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

export function Tapestry({ report, onHome }: { report: Report | null; onHome: () => void }) {
  const idx = useTapestry();
  const base = useMapImage(idx ? "tapestry/base" : null);
  const shadow = useMapImage(idx ? "tapestry/shadow" : null);
  const woven = useMapImage(idx ? "tapestry/woven" : null);
  const [sel, setSel] = useState<string | null>(null);

  if (idx === null) return <Drawn report={report} onHome={onHome} />;

  const looks = new Map(idx?.sections.map((s) => [s.name, lookOf(report, s)]) ?? []);
  const done = [...looks.values()].filter((l) => l === "woven").length;
  const picked = idx?.sections.find((s) => s.name === sel);
  const q = picked && questOf(report, picked.name === "GameClear" ? "Defeat_Ganon" : picked.name);
  const look = picked ? looks.get(picked.name) : undefined;

  return (
    <>
      <Header
        title="Tapestry"
        onLeft={onHome}
        help="The Threads of Time tapestry from your own game files. A section is woven when the save says its quest is complete, and shows as a silhouette while the quest is under way. Tap a section to see which quest it is."
      />
      <div className="tap">
        {idx && base && shadow && woven ? (
          <PanZoom aspect={idx.height / idx.width} cover={0.9} focus={{ x: 0.5, y: 0 }} focusKey="top">
            <svg viewBox={`0 0 ${idx.width} ${idx.height}`} className="pz-img" style={{ pointerEvents: "auto" }}>
              <defs>
                {idx.sections.map((s) => <clipPath key={s.name} id={`tap-${s.name}`}><path d={looks.get(s.name) === "shadow" ? s.shadow! : s.path} /></clipPath>)}
              </defs>
              <image href={base.url} width={idx.width} height={idx.height} />
              {/* Silhouettes first, so a woven section overlapping one (the Master Sword over All Sage) stays on top. */}
              {(["shadow", "woven"] as const).map((l) =>
                idx.sections.filter((s) => looks.get(s.name) === l).map((s) => (
                  <image key={s.name} href={(l === "woven" ? woven : shadow).url} width={idx.width} height={idx.height} clipPath={`url(#tap-${s.name})`} />
                )),
              )}
              {idx.sections.map((s) => (
                <path
                  key={s.name}
                  d={s.path}
                  className={`tap-hit ${sel === s.name ? "on" : ""}`}
                  onClick={() => setSel(sel === s.name ? null : s.name)}
                />
              ))}
            </svg>
          </PanZoom>
        ) : (
          <p className="empty">Weaving the tapestry from your game files…</p>
        )}
        {idx && <div className="tap-count">{done}/{idx.sections.length} woven</div>}
        {picked && (
          <div className="tap-cap" onClick={() => setSel(null)}>
            <b>{look === "empty" ? "???" : nice(picked.name, report)}</b>
            <span>
              {look === "woven" ? "Woven" : look === "shadow" ? (q?.note ?? "Under way") : "Not reached yet"}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

/** Story order for the drawn tapestry (the report lists quests alphabetically). Unlisted quests are appended. */
const ORDER = [
  "Meet_DekuTree", "Goto_HyruleCastle", "Get_StoneOfForest", "Get_StoneOfFire", "Get_StoneOfWater", "DoorOfTime",
  "SageOfForest", "SageOfFire", "SageOfWater", "SageOfShadow", "SageOfSpirit", "SageOfLight", "AllSage",
  "EscapeFromCrumblingGanonCastle", "Defeat_Ganon",
].map((n) => `story/${n}`);

/** The app's own drawn tapestry, used when the game's files cannot be read. */
function Drawn({ report, onHome }: { report: Report | null; onHome: () => void }) {
  const [z, setZ] = useState(1);
  const steps = cat(report, "story")?.entries ?? [];
  const rank = (l: string) => (ORDER.indexOf(l) === -1 ? 99 : ORDER.indexOf(l));
  const list = [...steps].sort((a, b) => rank(a.id) - rank(b.id));
  const done = list.filter((s) => s.have).length;
  const cols = 3;
  const rows = Math.ceil(list.length / cols);
  return (
    <>
      <Header title="Tapestry" onLeft={onHome} help="Your story steps as woven panels. A panel fills with colour when the save says that step is done. The artwork is drawn for this app, because the game's own tapestry could not be read from your game folder." />
      <div className="scroll grain">
        <div className="rowline" style={{ margin: ".8em 1.2em 0" }}>
          <span className="small muted">{done}/{list.length} woven</span>
          <span><button className="pillbtn" onClick={() => setZ(Math.max(0.8, z - 0.2))}>−</button> <button className="pillbtn" onClick={() => setZ(Math.min(2, z + 0.2))}>＋</button></span>
        </div>
        {!report && <p className="empty">No save report yet.</p>}
        <div className="tapestry" style={{ overflow: "auto" }}>
          <svg viewBox={`0 0 ${cols * 100 + 20} ${rows * 120 + 20}`} style={{ width: `${z * 100}%`, display: "block" }}>
            <rect x="2" y="2" width={cols * 100 + 16} height={rows * 120 + 16} fill="#24160c" stroke="#8a6a3a" strokeWidth="3" />
            {list.map((s, i) => {
              const x = 10 + (i % cols) * 100, y = 10 + Math.floor(i / cols) * 120;
              const hue = (i * 37) % 360;
              const on = !!s.have;
              return (
                <g key={s.id}>
                  <rect x={x + 3} y={y + 3} width="90" height="104" className="cell" style={on ? { fill: `hsl(${hue} 38% 30%)`, stroke: "#d9b25f" } : undefined} />
                  {on && <circle cx={x + 48} cy={y + 42} r="20" fill={`hsl(${hue} 55% 55%)`} opacity=".85" />}
                  {on && <path d={`M${x + 20} ${y + 80}l14-18 12 12 10-8 16 14z`} fill={`hsl(${hue} 30% 20%)`} />}
                  {!on && Array.from({ length: 8 }, (_, k) => <line key={k} x1={x + 8 + k * 11} y1={y + 8} x2={x + 8 + k * 11} y2={y + 100} stroke="#4a3a2a" strokeWidth="1" strokeDasharray="3 4" />)}
                  <text x={x + 48} y={y + 98} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={on ? "#f1e8d6" : "#7a6a55"} fontFamily="Nunito Sans, sans-serif">
                    {on ? s.label.slice(0, 22) : "???"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </>
  );
}
