import { useCallback, useEffect, useRef, useState } from "react";
import { Header, Seg, Sheet, Tabs } from "../components/chrome";
import { NOTE_LABEL, NOTE_PITCH, SONGS, type Note } from "../data/content";
import { decodeScore, encodeScore, qrPath, scanScore } from "../data/scorecode";
import { useOwned } from "../data/rewards";
import { useLocal } from "../store";
import { cat, type Report } from "../report";

const TABS = ["Play", "Game Scores", "Original Scores"] as const;
const KEYS: Record<string, Note> = { a: "A", ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R" };

/** Pictures drawn for this app (src/assets/ocarina): ocarinas, song emblems and tab icons. Missing ones fall back. */
const ART = import.meta.glob<string>("../assets/ocarina/*.webp", { eager: true, import: "default" });
const art = (name: string): string | undefined => ART[`../assets/ocarina/${name}.webp`];
const TAB_ICONS = { Play: art("tab_play"), "Game Scores": art("tab_scores"), "Original Scores": art("tab_original") };
const SONG_ART: Record<string, string> = {
  "Zelda's Lullaby": "song_lullaby", "Epona's Song": "song_epona", "Saria's Song": "song_saria", "Sun's Song": "song_sun",
  "Song of Time": "song_time", "Song of Storms": "song_storms", "Minuet of Forest": "song_minuet", "Bolero of Fire": "song_bolero",
  "Serenade of Water": "song_serenade", "Requiem of Spirit": "song_requiem", "Nocturne of Shadow": "song_nocturne", "Prelude of Light": "song_prelude",
};

/** The ocarinas to play: two to start with, two more bought with Rumor Hunt points. Each has its own sound. */
const OCARINAS = [
  { id: "blue", name: "Blue Ocarina", wave: "sine" as OscillatorType, vib: 4, reward: null },
  { id: "clay", name: "Clay Ocarina", wave: "triangle" as OscillatorType, vib: 2, reward: null },
  { id: "jade", name: "Jade Ocarina", wave: "sine" as OscillatorType, vib: 8, reward: "ocarina-jade" },
  { id: "gold", name: "Gilded Ocarina", wave: "triangle" as OscillatorType, vib: 6, reward: "ocarina-gold" },
];
type Ocarina = (typeof OCARINAS)[number];

interface Take { id: string; name: string; at: number; notes: { n: Note; dt: number }[] }

let ctx: AudioContext | null = null;
function tone(n: Note, o: Ocarina = OCARINAS[0]) {
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.wave; osc.frequency.value = NOTE_PITCH[n];
  const v = ctx.createOscillator(), vg = ctx.createGain();
  v.frequency.value = 5.5; vg.gain.value = o.vib; v.connect(vg); vg.connect(osc.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.wave === "sine" ? 0.28 : 0.2, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.7);
  osc.connect(g).connect(ctx.destination); osc.start(t); v.start(t); osc.stop(t + 0.75); v.stop(t + 0.75);
}

/** Where the five holes sit on the painted ocarinas (percent of the picture), and on the drawn fallback. */
const HOLES: Record<Note, [number, number]> = { U: [24, 36], L: [38, 30], R: [52, 36], D: [31, 66], A: [45, 66] };
const POS: Record<Note, [number, number]> = { U: [30, 36], L: [50, 28], R: [70, 36], D: [40, 68], A: [62, 70] };

/** The ocarina with its five holes to play. Uses the chosen ocarina's painting when it is in the app. */
function Pad({ lit, onNote, ocarina = OCARINAS[0], wide }: { lit: Note | null; onNote: (n: Note) => void; ocarina?: Ocarina; wide?: boolean }) {
  const pic = art(`ocarina_${ocarina.id}`);
  const at = pic ? HOLES : POS;
  return (
    <div className={`ocarina ${wide ? "wide" : ""}`} style={{ aspectRatio: pic ? "16 / 7" : "4 / 3" }}>
      {pic ? <img src={pic} alt="" className="oc-pic" /> : (
        <svg viewBox="0 0 100 75" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
          <defs><linearGradient id="oc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f86d6" /><stop offset="1" stopColor="#173a78" /></linearGradient></defs>
          <path d="M6 44C6 22 28 8 54 10c26 2 42 14 40 30-2 18-26 28-52 24C20 61 6 56 6 44z" fill="url(#oc)" stroke="#0b1b33" strokeWidth="1.4" />
          <path d="M90 36l8-6 0 12z" fill="#c8b88a" stroke="#6b5a3a" strokeWidth=".8" />
          <path d="M18 30c10-10 30-14 46-10" stroke="#fff" strokeWidth="1.2" fill="none" opacity=".4" strokeLinecap="round" />
        </svg>
      )}
      {(Object.keys(at) as Note[]).map((n) => (
        <button key={n} className={`hole ${pic ? "on-pic" : ""} ${lit === n ? "on" : ""}`} style={{ left: `${at[n][0]}%`, top: `${at[n][1]}%` }}
          onPointerDown={() => onNote(n)} aria-label={`Note ${NOTE_LABEL[n]}`}>{NOTE_LABEL[n]}</button>
      ))}
    </div>
  );
}

/** The grid's rows, by pitch from D5 down to B3, as the original's score view lays them out; each ocarina note sits on
 *  its own pitch (A = D4, ▼ = F4, ▶ = A4, ◀ = B4, ▲ = D5). */
const ROWS = ["D", "C", "B", "A", "G", "F", "E", "D", "C", "B"];
const ROW_OF: Record<Note, number> = { U: 0, L: 2, R: 3, D: 5, A: 7 };
const PX = 0.09; // pixels per millisecond

/** A score as a note grid: one row per pitch, time running to the right, with an optional playhead. */
function Roll({ notes, head = null, done = 0 }: { notes: { n: Note; t: number }[]; head?: number | null; done?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const end = (notes.at(-1)?.t ?? 0) + 900;
  useEffect(() => {
    const el = ref.current;
    if (el && head !== null) el.scrollLeft = Math.max(0, 20 + head * PX - el.clientWidth / 2);
  }, [head]);
  useEffect(() => {
    const el = ref.current;
    if (el && head === null) el.scrollLeft = el.scrollWidth; // follow a live recording
  }, [notes.length, head]);
  return (
    <div className="roll">
      <div className="roll-keys">{ROWS.map((n, i) => <span key={i}>{n}</span>)}</div>
      <div className="roll-grid" ref={ref}>
        <div style={{ width: 40 + end * PX, minWidth: "100%", height: "100%", position: "relative" }}>
          {notes.map((x, i) => {
            const len = Math.min(600, (notes[i + 1]?.t ?? x.t + 600) - x.t);
            return (
              <span key={i} className={`roll-n ${i < done ? "hit" : ""}`} style={{ left: 20 + x.t * PX, top: `${ROW_OF[x.n] * 10}%`, width: Math.max(22, len * PX - 4) }} title={NOTE_LABEL[x.n]}>
                {ROWS[ROW_OF[x.n]]}<small>{NOTE_LABEL[x.n]}</small>
              </span>
            );
          })}
          {head !== null && <i className="roll-head" style={{ left: 20 + head * PX }} />}
        </div>
      </div>
    </div>
  );
}

/** A take's notes at their times from the start. */
const timed = (notes: Take["notes"]) => { let t = 0; return notes.map((x) => ({ n: x.n, t: (t += x.dt) })); };

/** The share card: the score's name and a QR code of it, drawn for this app. */
function ShareCard({ take }: { take: Take }) {
  const q = qrPath(encodeScore(take));
  const m = 4; // quiet zone, in modules
  return (
    <svg className="share-card" viewBox="0 0 300 380" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a3320" /><stop offset="1" stopColor="#1c140c" /></linearGradient></defs>
      <rect width="300" height="380" rx="10" fill="url(#sc)" />
      <rect x="8" y="8" width="284" height="364" rx="7" fill="none" stroke="#d9b25f" strokeWidth="2" />
      <text x="150" y="40" textAnchor="middle" fill="#d9b25f" fontFamily="Cinzel, serif" fontWeight="700" fontSize="17">Ocarina Journal</text>
      <text x="150" y="64" textAnchor="middle" fill="#f1e8d6" fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="15">{take.name}</text>
      <rect x="50" y="80" width="200" height="200" rx="6" fill="#fffaf0" />
      <svg x="58" y="88" width="184" height="184" viewBox={`${-m} ${-m} ${q.size + 2 * m} ${q.size + 2 * m}`} shapeRendering="crispEdges">
        <path d={q.d} fill="#1c140c" />
      </svg>
      <text x="150" y="312" textAnchor="middle" fill="#cdb99c" fontFamily="Nunito Sans, sans-serif" fontSize="11">{take.notes.length} notes · scan with Ocarina Journal</text>
      <text x="150" y="340" textAnchor="middle" fill="#8a7458" fontFamily="Nunito Sans, sans-serif" fontSize="9">An unofficial fan app</text>
    </svg>
  );
}

/** The share card as a PNG file, downloaded. */
async function saveCard(svg: SVGSVGElement, name: string) {
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
  const c = document.createElement("canvas");
  c.width = 600; c.height = 760;
  c.getContext("2d")!.drawImage(img, 0, 0, 600, 760);
  URL.revokeObjectURL(url);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `${name.replace(/[^\w -]/g, "")} score.png`;
  a.click();
}

export function Ocarina({ report, onHome, start }: { report: Report | null; onHome: () => void; start?: string | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Play");
  const [song, setSong] = useState<string | null>(start ?? null);
  const [takes, setTakes] = useLocal<Take[]>("ocarina.takes", []);
  const [favs, setFavs] = useLocal<Record<string, true>>("ocarina.favorites", {});
  const [ocId, setOcId] = useLocal("ocarina.instrument", "blue");
  const [owned] = useOwned();
  const [lit, setLit] = useState<Note | null>(null);
  const [rec, setRec] = useState<{ n: Note; t: number }[] | null>(null);
  const [naming, setNaming] = useState<Take["notes"] | null>(null);
  const [name, setName] = useState("");
  const [guided, setGuided] = useState(false);
  const [mode, setMode] = useState<"Play only the beginning" | "Play the full version">("Play the full version");
  const [list, setList] = useState<"Link's Scores" | "Favorites">("Link's Scores");
  const [at, setAt] = useState(0);
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState<Take | null>(null);
  const [sharing, setSharing] = useState<Take | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [head, setHead] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);
  const card = useRef<HTMLDivElement>(null);
  const mine = OCARINAS.filter((o) => !o.reward || owned[o.reward]);
  const ocarina = mine.find((o) => o.id === ocId) ?? OCARINAS[0];
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 1800); };
  const stopAll = () => { timers.current.forEach(clearTimeout); timers.current = []; cancelAnimationFrame(raf.current); setHead(null); };
  /** Moves the playhead across `len` milliseconds. */
  const runHead = (len: number) => {
    const t0 = performance.now();
    const step = () => { const t = performance.now() - t0; if (t > len) return setHead(null); setHead(t); raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => stopAll, []);

  const known = new Set((cat(report, "songs")?.entries ?? []).filter((e) => e.have).map((e) => e.label));
  const seq = (song ? SONGS[song] ?? [] : []).slice(0, mode === "Play only the beginning" ? 3 : undefined);
  const play = (n: Note, ms = 160) => { tone(n, ocarina); setLit(n); setTimeout(() => setLit(null), ms); };

  const press = useCallback((n: Note) => {
    tone(n, ocarina); setLit(n); setTimeout(() => setLit(null), 160);
    setRec((r) => (r ? [...r, { n, t: performance.now() }] : r));
    if (song && guided) setAt((a) => (seq[a] === n ? (a + 1 >= seq.length ? (flash("Well played!"), 0) : a + 1) : a));
  }, [song, guided, seq, ocarina]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { const n = KEYS[e.key]; if (n && !e.repeat && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); press(n); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [press]);

  const demo = () => {
    stopAll(); setGuided(false);
    seq.forEach((n, i) => timers.current.push(window.setTimeout(() => { play(n, 300); setAt(i + 1); }, i * 650)));
    timers.current.push(window.setTimeout(() => setAt(0), seq.length * 650 + 300));
    runHead(seq.length * 650);
  };

  const stopRec = () => {
    if (rec && rec.length) setNaming(rec.map((x, i) => ({ n: x.n, dt: i ? Math.round(x.t - rec[i - 1].t) : 0 })));
    setRec(null);
  };
  const playTake = (t: Take) => {
    stopAll();
    const notes = timed(t.notes);
    notes.forEach((x) => timers.current.push(window.setTimeout(() => play(x.n), x.t)));
    runHead((notes.at(-1)?.t ?? 0) + 400);
  };
  const addTake = (s: { name: string; notes: Take["notes"] } | null) => {
    if (!s) return flash("No score found in that");
    setTakes([{ id: crypto.randomUUID(), name: s.name, at: Date.now(), notes: s.notes }, ...takes]);
    setCode(""); flash(`Added "${s.name}"`);
  };

  const shareSheet = sharing && (
    <Sheet title="Share a Music Score" onClose={() => setSharing(null)}>
      <div style={{ padding: "0 1.2em 1em", textAlign: "center" }}>
        <div ref={card}><ShareCard take={sharing} /></div>
        <div style={{ display: "flex", gap: ".8em", justifyContent: "center", marginTop: ".8em" }}>
          <button className="pillbtn" onClick={() => { navigator.clipboard?.writeText(encodeScore(sharing)); flash("Share code copied"); }}>⧉ Copy code</button>
          <button className="pillbtn" onClick={() => { const svg = card.current?.querySelector("svg"); if (svg) saveCard(svg, sharing.name).catch(() => flash("Could not save the picture")); }}>⤓ Save as Image</button>
        </div>
        <p className="small muted" style={{ marginTop: ".8em" }}>Friends can scan the picture or paste the code under Original Scores. Nothing is sent anywhere.</p>
      </div>
    </Sheet>
  );

  const chooser = choosing && (
    <Sheet title="Change Ocarina" onClose={() => setChoosing(false)}>
      <div className="oc-choose">
        {OCARINAS.map((o) => {
          const have = !o.reward || owned[o.reward];
          const pic = art(`ocarina_${o.id}`);
          return (
            <button key={o.id} className={`oc-opt ${o.id === ocarina.id ? "on" : ""}`} disabled={!have} onClick={() => { setOcId(o.id); setChoosing(false); tone("A", o); }}>
              {pic ? <img src={pic} alt="" /> : <span className="glyph">♪</span>}
              <b>{have ? o.name : "???"}</b>
              <small>{have ? (o.id === ocarina.id ? "Playing" : "Tap to play") : "A Rumor Hunt reward"}</small>
            </button>
          );
        })}
      </div>
    </Sheet>
  );

  // ---------- one of the player's own scores ----------
  if (open) {
    return (
      <>
        <Header title={open.name} left="back" onLeft={() => { stopAll(); setOpen(null); }} sub="Original Scores" />
        <div className="scroll grain">
          <Pad lit={lit} onNote={(n) => play(n)} ocarina={ocarina} />
          <div className="transport">
            <button className="tp" aria-label="Back to the start" onClick={stopAll}>⏮</button>
            <button className="tp big" aria-label="Play" onClick={() => playTake(open)}>▶</button>
            <button className="pillbtn" onClick={() => setSharing(open)}>Share</button>
          </div>
          <Roll notes={timed(open.notes)} head={head} />
          <p className="note">{open.notes.length} notes, recorded {new Date(open.at).toLocaleDateString()}.</p>
          <button className="btn ghost block" onClick={() => { stopAll(); setTakes(takes.filter((x) => x.id !== open.id)); setOpen(null); }}>Delete this score</button>
        </div>
        {shareSheet}
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  // ---------- song detail ----------
  if (song) {
    return (
      <>
        <Header title={song} left="back" onLeft={() => { stopAll(); setSong(null); setGuided(false); setAt(0); }} sub="Game Scores"
          right={<button className={`icon-btn fav ${favs[song] ? "on" : ""}`} aria-label="Add to favorites" onClick={() => { const f = { ...favs }; if (f[song]) delete f[song]; else f[song] = true; setFavs(f); }}>{favs[song] ? "★" : "☆"}</button>} />
        <div className="scroll grain">
          <Pad lit={lit} onNote={press} ocarina={ocarina} />
          <div className="transport">
            <button className="tp" aria-label="Back to the start" onClick={() => { stopAll(); setAt(0); }}>⏮</button>
            <button className="tp big" aria-label="Play a demo" onClick={demo}>▶</button>
            <button className={`pillbtn ${guided ? "lit" : ""}`} onClick={() => { stopAll(); setGuided(!guided); setAt(0); }}>♪ Guided Playback</button>
          </div>
          <div style={{ margin: "1em" }}><Seg items={["Play only the beginning", "Play the full version"] as const} value={mode} onChange={(m) => { setMode(m); setAt(0); }} /></div>
          <Roll notes={seq.map((n, i) => ({ n, t: i * 650 }))} head={head} done={at} />
          <p className="note">{guided ? "Play the notes in order (tap, or use the A key and arrow keys)." : "Press ▶ to hear it, or Guided Playback to follow along."}</p>
        </div>
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  const songs = Object.keys(SONGS).filter((s) => list === "Link's Scores" || favs[s]);
  return (
    <>
      <Header title="Ocarina" onLeft={onHome}
        help="Tap the holes or use the A key and arrow keys. Record a performance and name it, learn the songs you have found with Guided Playback, and share your own scores as a QR card or a code. More ocarinas can be bought with Rumor Hunt points." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} icons={TAB_ICONS} />
      <div className="scroll grain">
        {tab === "Play" && (
          <>
            <Pad lit={lit} onNote={press} ocarina={ocarina} wide />
            <div className="oc-actions">
              {rec ? <button className="btn" onClick={stopRec}>■ Stop ({rec.length})</button> : <button className="btn ghost" onClick={() => setRec([])}>● Record Performance</button>}
              <button className="pillbtn" onClick={() => setChoosing(true)}>⇄ Change Ocarina</button>
            </div>
            {rec && <Roll notes={rec.map((x) => ({ n: x.n, t: x.t - rec[0].t }))} />}
            <p className="note">Playing the {ocarina.name}. Notes: A, ▲ ▼ ◀ ▶ (keyboard: A and the arrow keys).</p>
          </>
        )}
        {tab === "Game Scores" && (
          <>
            <div style={{ margin: ".9em 1em 0" }}><Seg items={["Link's Scores", "Favorites"] as const} value={list} onChange={setList} /></div>
            <p className="small muted" style={{ margin: ".8em 1.2em 0" }}>Scores collected: {report ? known.size : Object.keys(SONGS).length}</p>
            {songs.length === 0 && <p className="empty">No favorites yet. Open a song and tap ☆ to add it.</p>}
            <div className="songs">
              {songs.map((s) => {
                const ok = report ? known.has(s) : true;
                const pic = SONG_ART[s] && art(SONG_ART[s]);
                return (
                  <button key={s} className={`song ${ok ? "" : "locked"}`} disabled={!ok} onClick={() => { setSong(s); setAt(0); }}>
                    <span className="pic">{pic && ok ? <img src={pic} alt="" /> : <span className="glyph">𝄞</span>}{favs[s] && <i className="star">★</i>}</span>
                    <span className="nm">{ok ? s : "???"}</span>
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
                <button className="rowline" style={{ width: "100%", background: "none", border: 0, padding: 0, color: "inherit" }} onClick={() => setOpen(t)}><b>{t.name}</b><span className="small muted">{t.notes.length} notes ›</span></button>
                <div style={{ display: "flex", gap: ".6em", marginTop: ".5em", flexWrap: "wrap" }}>
                  <button className="pillbtn" onClick={() => playTake(t)}>▶ Play</button>
                  <button className="pillbtn" onClick={() => setSharing(t)}>Share</button>
                  <button className="pillbtn" onClick={() => setTakes(takes.filter((x) => x.id !== t.id))}>Delete</button>
                </div>
              </div>
            ))}
            <div style={{ padding: "0 1em" }}>
              <div className="small muted" style={{ margin: "1em 0 .4em" }}>Add a friend's score</div>
              <input type="text" value={code} placeholder="Paste a share code" onChange={(e) => setCode(e.target.value)} />
              <div style={{ display: "flex", gap: ".6em", margin: ".8em 0" }}>
                <button className="btn ghost" style={{ flex: 1, margin: 0 }} onClick={() => addTake(decodeScore(code))}>Add code</button>
                <label className="btn ghost" style={{ flex: 1, margin: 0, textAlign: "center", cursor: "pointer" }}>
                  ⌗ Scan a QR picture
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scanScore(f).then(addTake).catch(() => flash("Could not read that picture")); }} />
                </label>
              </div>
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
      {shareSheet}
      {chooser}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
