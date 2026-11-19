import { useCallback, useEffect, useRef, useState } from "react";
import { Header, Seg, Sheet, Tabs } from "../components/chrome";
import { NOTE_LABEL, NOTE_PITCH, SONGS, type Note } from "../data/content";
import { useLocal } from "../store";
import { cat, type Report } from "../report";

const TABS = ["Play", "Game Scores", "Original Scores"] as const;
const POS: Record<Note, [number, number]> = { U: [30, 36], L: [50, 28], R: [70, 36], D: [40, 68], A: [62, 70] };
const ROW: Record<Note, number> = { U: 0, L: 1, R: 2, D: 3, A: 4 };
const KEYS: Record<string, Note> = { a: "A", ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R" };

interface Take { id: string; name: string; at: number; notes: { n: Note; dt: number }[] }

let ctx: AudioContext | null = null;
function tone(n: Note) {
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.value = NOTE_PITCH[n];
  const v = ctx.createOscillator(), vg = ctx.createGain();
  v.frequency.value = 5.5; vg.gain.value = 4; v.connect(vg); vg.connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.7);
  o.connect(g).connect(ctx.destination); o.start(t); v.start(t); o.stop(t + 0.75); v.stop(t + 0.75);
}

/** The ocarina picture with touch targets, drawn for this app. */
function Pad({ lit, onNote }: { lit: Note | null; onNote: (n: Note) => void }) {
  return (
    <div className="ocarina" style={{ aspectRatio: "4 / 3" }}>
      <svg viewBox="0 0 100 75" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
        <defs><linearGradient id="oc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f86d6" /><stop offset="1" stopColor="#173a78" /></linearGradient></defs>
        <path d="M6 44C6 22 28 8 54 10c26 2 42 14 40 30-2 18-26 28-52 24C20 61 6 56 6 44z" fill="url(#oc)" stroke="#0b1b33" strokeWidth="1.4" />
        <path d="M90 36l8-6 0 12z" fill="#c8b88a" stroke="#6b5a3a" strokeWidth=".8" />
        <path d="M18 30c10-10 30-14 46-10" stroke="#fff" strokeWidth="1.2" fill="none" opacity=".4" strokeLinecap="round" />
      </svg>
      {(Object.keys(POS) as Note[]).map((n) => (
        <button key={n} className={`hole ${lit === n ? "on" : ""}`} style={{ left: `${POS[n][0]}%`, top: `${POS[n][1]}%` }}
          onPointerDown={() => onNote(n)} aria-label={`Note ${NOTE_LABEL[n]}`}>{NOTE_LABEL[n]}</button>
      ))}
    </div>
  );
}

function Staff({ notes, at }: { notes: Note[]; at: number }) {
  return (
    <div className="staff">
      {notes.map((n, i) => (
        <span key={i} className={`n ${i < at ? "hit" : ""}`} style={{ left: `${10 + (80 * i) / Math.max(1, notes.length - 1)}%`, top: `${12 + ROW[n] * 19}%` }}>{NOTE_LABEL[n]}</span>
      ))}
    </div>
  );
}

export function Ocarina({ report, onHome, start }: { report: Report | null; onHome: () => void; start?: string | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Play");
  const [song, setSong] = useState<string | null>(start ?? null);
  const [takes, setTakes] = useLocal<Take[]>("ocarina.takes", []);
  const [lit, setLit] = useState<Note | null>(null);
  const [rec, setRec] = useState<{ n: Note; t: number }[] | null>(null);
  const [naming, setNaming] = useState<Take["notes"] | null>(null);
  const [name, setName] = useState("");
  const [guided, setGuided] = useState(false);
  const [mode, setMode] = useState<"Play only the beginning" | "Play the full version">("Play the full version");
  const [at, setAt] = useState(0);
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const timers = useRef<number[]>([]);
  const stopAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => stopAll, []);

  const known = new Set((cat(report, "songs")?.entries ?? []).filter((e) => e.have).map((e) => e.label));
  const seq = (song ? SONGS[song] ?? [] : []).slice(0, mode === "Play only the beginning" ? 3 : undefined);

  const press = useCallback((n: Note) => {
    tone(n); setLit(n); setTimeout(() => setLit(null), 160);
    setRec((r) => (r ? [...r, { n, t: performance.now() }] : r));
    if (song && guided) setAt((a) => (seq[a] === n ? (a + 1 >= seq.length ? (setMsg("Well played!"), setTimeout(() => setMsg(""), 1800), 0) : a + 1) : a));
  }, [song, guided, seq]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { const n = KEYS[e.key]; if (n && !e.repeat) { e.preventDefault(); press(n); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [press]);

  const demo = () => {
    stopAll(); setGuided(false);
    seq.forEach((n, i) => timers.current.push(window.setTimeout(() => { tone(n); setLit(n); setAt(i + 1); setTimeout(() => setLit(null), 300); }, i * 650)));
    timers.current.push(window.setTimeout(() => setAt(0), seq.length * 650 + 300));
  };

  const stopRec = () => {
    if (rec && rec.length) setNaming(rec.map((x, i) => ({ n: x.n, dt: i ? Math.round(x.t - rec[i - 1].t) : 0 })));
    setRec(null);
  };
  const playTake = (t: Take) => { stopAll(); let acc = 0; t.notes.forEach((x) => { acc += x.dt; timers.current.push(window.setTimeout(() => { tone(x.n); setLit(x.n); setTimeout(() => setLit(null), 160); }, acc)); }); };

  // ---------- song detail ----------
  if (song) {
    return (
      <>
        <Header title={song} left="back" onLeft={() => { stopAll(); setSong(null); setGuided(false); setAt(0); }} sub="Game Scores" />
        <div className="scroll grain">
          <Pad lit={lit} onNote={press} />
          <div style={{ display: "flex", gap: "1em", justifyContent: "center", alignItems: "center" }}>
            <button className="btn" onClick={demo}>▶ Demo</button>
            <button className={`pillbtn`} style={guided ? { borderColor: "var(--gold)" } : undefined} onClick={() => { stopAll(); setGuided(!guided); setAt(0); }}>♪ Guided Play</button>
          </div>
          <div style={{ margin: "1em" }}><Seg items={["Play only the beginning", "Play the full version"] as const} value={mode} onChange={(m) => { setMode(m); setAt(0); }} /></div>
          <Staff notes={seq} at={at} />
          <p className="note">{guided ? "Play the notes in order (tap, or use the A key and arrow keys)." : "Press Demo to hear it, or Guided Play to follow along."}</p>
        </div>
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  return (
    <>
      <Header title="Ocarina" onLeft={onHome} help="Tap the holes or use the A key and arrow keys. Record a take and name it, learn songs you have found with a guided staff, and share takes as text codes (the original uses QR codes)." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="scroll grain">
        {tab === "Play" && (
          <>
            <Pad lit={lit} onNote={press} />
            <div style={{ textAlign: "center", margin: ".6em 0" }}>
              {rec ? <button className="btn" onClick={stopRec}>■ Stop ({rec.length})</button> : <button className="btn ghost" onClick={() => setRec([])}>● Record Performance</button>}
            </div>
            <p className="note">Notes: A, ▲ ▼ ◀ ▶ (keyboard: A and the arrow keys).</p>
          </>
        )}
        {tab === "Game Scores" && (
          <>
            <p className="small muted" style={{ margin: "1em 1.2em 0" }}>Scores collected: {known.size}</p>
            <div className="pgrid" style={{ gridTemplateColumns: "1fr 1fr 1fr", paddingTop: ".8em" }}>
              {Object.keys(SONGS).map((s) => {
                const ok = report ? known.has(s) : true;
                return (
                  <button key={s} className="card" style={{ margin: 0, padding: ".9em .3em", textAlign: "center", opacity: ok ? 1 : 0.4, aspectRatio: "auto" }} disabled={!ok} onClick={() => { setSong(s); setAt(0); }}>
                    <div style={{ fontSize: "1.8em" }}>𝄞</div><div className="small" style={{ fontWeight: 800 }}>{ok ? s : "???"}</div>
                  </button>
                );
              })}
            </div>
            {!report && <p className="note">No save report, so every song is shown as available.</p>}
          </>
        )}
        {tab === "Original Scores" && (
          <>
            {takes.length === 0 && <p className="empty">No recordings yet. Record one on the Play tab.</p>}
            {takes.map((t) => (
              <div key={t.id} className="card" style={{ margin: ".8em 1em" }}>
                <div className="rowline"><b>{t.name}</b><span className="small muted">{t.notes.length} notes</span></div>
                <div style={{ display: "flex", gap: ".6em", marginTop: ".5em", flexWrap: "wrap" }}>
                  <button className="pillbtn" onClick={() => playTake(t)}>▶ Play</button>
                  <button className="pillbtn" onClick={() => { navigator.clipboard?.writeText(btoa(JSON.stringify({ name: t.name, notes: t.notes }))); setMsg("Share code copied"); setTimeout(() => setMsg(""), 1600); }}>Share code</button>
                  <button className="pillbtn" onClick={() => setTakes(takes.filter((x) => x.id !== t.id))}>Delete</button>
                </div>
              </div>
            ))}
            <div style={{ padding: "0 1em" }}>
              <div className="small muted" style={{ margin: "1em 0 .4em" }}>Import a share code</div>
              <input type="text" value={code} placeholder="Paste a code" onChange={(e) => setCode(e.target.value)} />
              <button className="btn ghost block" style={{ width: "100%", margin: ".8em 0" }} onClick={() => {
                try {
                  const d = JSON.parse(atob(code.trim()));
                  if (!Array.isArray(d.notes) || typeof d.name !== "string") throw 0;
                  setTakes([{ id: crypto.randomUUID(), name: d.name.slice(0, 20), at: Date.now(), notes: d.notes.filter((x: { n: string }) => x.n in NOTE_PITCH).slice(0, 400) }, ...takes]); setCode("");
                } catch { setMsg("That code isn't valid"); setTimeout(() => setMsg(""), 1600); }
              }}>Import</button>
            </div>
          </>
        )}
      </div>
      {naming && (
        <Sheet title="Score Name" onClose={() => setNaming(null)}>
          <div style={{ padding: "0 1.2em" }}>
            <p className="small muted">You can enter a name between 2 and 20 characters long.</p>
            <input type="text" value={name} maxLength={20} autoFocus onChange={(e) => setName(e.target.value)} />
            <button className="btn block" style={{ width: "100%", margin: "1em 0 .4em" }} disabled={name.trim().length < 2}
              onClick={() => { setTakes([{ id: crypto.randomUUID(), name: name.trim(), at: Date.now(), notes: naming }, ...takes]); setNaming(null); setName(""); setTab("Original Scores"); }}>Save</button>
            <button className="btn ghost block" style={{ width: "100%", margin: 0 }} onClick={() => setNaming(null)}>Return to Recording</button>
          </div>
        </Sheet>
      )}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
