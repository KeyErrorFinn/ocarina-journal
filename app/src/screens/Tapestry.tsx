import { useState } from "react";
import { Header } from "../components/chrome";
import { cat, type Report } from "../report";

/** Story order for the tapestry (the report lists steps alphabetically). Unlisted steps are appended. */
const ORDER = [
  "Meet Deku Tree", "Goto Hyrule Castle", "Get Stone Of Forest", "Get Stone Of Fire", "Get Stone Of Water", "Door Of Time",
  "Sage Of Forest", "Sage Of Fire", "Sage Of Water", "Sage Of Shadow", "Sage Of Spirit", "Sage Of Light", "All Sage",
  "Escape From Crumbling Ganon Castle", "Defeat Ganon",
];

export function Tapestry({ report, onHome }: { report: Report | null; onHome: () => void }) {
  const [z, setZ] = useState(1);
  const steps = cat(report, "story")?.entries ?? [];
  const rank = (l: string) => (ORDER.indexOf(l) === -1 ? 99 : ORDER.indexOf(l));
  const list = [...steps].sort((a, b) => rank(a.label) - rank(b.label));
  const done = list.filter((s) => s.have).length;
  const cols = 3;
  const rows = Math.ceil(list.length / cols);
  return (
    <>
      <Header title="Tapestry" onLeft={onHome} help="Your story steps as woven panels. A panel fills with colour when the save says that step is done. The artwork is drawn for this app." />
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
