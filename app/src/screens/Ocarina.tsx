import { useCallback, useEffect, useRef, useState } from "react";
import { Header, Seg, Sheet, Tabs } from "../components/chrome";
import { NOTE_BUTTON, NOTE_NAME, NOTES, SONG_IDS, SONGS, type Note } from "../data/content";
import { decodeScore, encodeScore, qrPath, scanScore } from "../data/scorecode";
import { useOwned } from "../data/rewards";
import { playNote, playRecording, preload, startNote, type Held, type Voice } from "../data/sound";
import { useLocal } from "../store";
import { cat, type Report } from "../report";

const TABS = ["Play", "Game Scores", "Original Scores"] as const;
/** Keyboard: the remake's buttons (L R A Y X), or the original's layout (Enter for its A, and the arrows). Hold Q for ♭
 *  and E for ♯. */
const KEYS: Record<string, Note> = {
  l: "A", r: "D", a: "R", y: "L", x: "U",
  ArrowDown: "D", ArrowRight: "R", ArrowLeft: "L", ArrowUp: "U", Enter: "A",
};

/** Pictures drawn for this app (src/assets/ocarina): ocarinas, song emblems and tab icons. Missing ones fall back. */
const ART = import.meta.glob<string>("../assets/ocarina/*.webp", { eager: true, import: "default" });
const art = (name: string): string | undefined => ART[`../assets/ocarina/${name}.webp`];
const TAB_ICONS = { Play: art("tab_play"), "Game Scores": art("tab_scores"), "Original Scores": art("tab_original") };
const SONG_ART: Record<string, string> = {
  "Zelda's Lullaby": "song_lullaby", "Epona's Song": "song_epona", "Saria's Song": "song_saria", "Sun's Song": "song_sun",
  "Song of Time": "song_time", "Song of Storms": "song_storms", "Minuet of the Forest": "song_minuet", "Bolero of Fire": "song_bolero",
  "Serenade of Water": "song_serenade", "Requiem of Spirit": "song_requiem", "Nocturne of Shadow": "song_nocturne", "Prelude of Light": "song_prelude",
};

/** The ocarinas to play: two to start with, two more bought with Rumor Hunt points. Each plays one of the game's two
 *  sets of ocarina sounds. */
const OCARINAS: { id: string; name: string; voice: Voice; reward: string | null }[] = [
  { id: "blue", name: "Blue Ocarina", voice: "Ocarina", reward: null },
  { id: "clay", name: "Clay Ocarina", voice: "Piccolo", reward: null },
  { id: "jade", name: "Jade Ocarina", voice: "Ocarina", reward: "ocarina-jade" },
  { id: "gold", name: "Gilded Ocarina", voice: "Ocarina", reward: "ocarina-gold" },
];
type Ocarina = (typeof OCARINAS)[number];

interface Take { id: string; name: string; at: number; notes: { n: Note; dt: number }[] }

/** The six finger holes on the painted ocarinas (percent of the picture, measured on them), from left to right. */
const HOLES: [number, number][] = [[22.2, 35.3], [30.4, 57.2], [37.5, 26.3], [47, 54.8], [53.9, 26.8], [67.5, 45.4]];
/** Which holes light for each note: more open holes, higher note, opening from the narrow end. */
const OPEN: Record<Note, number[]> = { A: [5], D: [5, 4], R: [5, 4, 3], L: [5, 4, 3, 2], U: [0, 1, 2, 3, 4, 5] };

/** One of the remake's buttons, drawn the way the game shows them in a score: a round light key with its letter. */
function Key({ n, small }: { n: Note; small?: boolean }) {
  const b = NOTE_BUTTON[n];
  return <span className={`nkey ${b.length > 1 || b === "L" || b === "R" ? "shoulder" : ""} ${small ? "small" : ""}`}>{b}</span>;
}

/** The chosen ocarina, with its holes lighting as notes sound. */
function Instrument({ lit, ocarina }: { lit: Note | null; ocarina: Ocarina }) {
  const pic = art(`ocarina_${ocarina.id}`) ?? art("ocarina_blue");
  return (
    <div className="ocarina2">
      {pic && <img src={pic} alt={ocarina.name} className="oc-pic" />}
      {HOLES.map(([x, y], i) => <i key={i} className={`oc-hole ${lit && OPEN[lit].includes(i) ? "on" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} />)}
    </div>
  );
}

/** The five note buttons in pitch order, with ♭ and ♯ to hold while pressing one. */
function Keys({ lit, onDown, onUp, bend, setBend }: { lit: Note | null; onDown: (n: Note) => void; onUp: (n: Note) => void; bend: number; setBend: (b: number) => void }) {
  const hold = (b: number) => ({ onPointerDown: () => setBend(b), onPointerUp: () => setBend(0), onPointerLeave: () => setBend(0), onPointerCancel: () => setBend(0) });
  return (
    <div className="oc-keys">
      <button className={`oc-bend ${bend < 0 ? "on" : ""}`} aria-label="Hold for flat" {...hold(-1)}>♭</button>
      {NOTES.map((n) => (
        <button key={n} className={`oc-key ${lit === n ? "on" : ""}`} aria-label={`Note ${NOTE_NAME[n]} (${NOTE_BUTTON[n]})`}
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); onDown(n); }}
          onPointerUp={() => onUp(n)} onPointerCancel={() => onUp(n)}>
          <Key n={n} />
          <small>{NOTE_NAME[n]}{n === "U" ? "'" : ""}</small>
        </button>
      ))}
      <button className={`oc-bend ${bend > 0 ? "on" : ""}`} aria-label="Hold for sharp" {...hold(1)}>♯</button>
    </div>
  );
}

/** A song as the game writes it: the notes' buttons on a five-line staff, D4 below the bottom line up to D5. */
function Staff({ notes, done = 0, at = -1 }: { notes: Note[]; done?: number; at?: number }) {
  // Steps above the bottom line (E4): D4 -1, F4 1, A4 3, B4 4, D5 6.
  const STEP: Record<Note, number> = { A: -1, D: 1, R: 3, L: 4, U: 6 };
  const W = 100 + notes.length * 44, H = 120, line = 12, bottom = 80;
  return (
    <svg className="staff" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={notes.map((n) => NOTE_BUTTON[n]).join(" ")}>
      {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="8" x2={W - 8} y1={bottom - i * line} y2={bottom - i * line} />)}
      <text className="clef" x="12" y={bottom + 14}>𝄞</text>
      {notes.map((n, i) => {
        const x = 86 + i * 44, y = bottom - STEP[n] * (line / 2);
        return (
          <g key={i} className={i < done ? "hit" : i === at ? "now" : ""}>
            {n === "A" && <line className="ledger" x1={x - 14} x2={x + 14} y1={bottom + line} y2={bottom + line} />}
            <circle cx={x} cy={y} r="11" />
            <text x={x} y={y + 4.5}>{NOTE_BUTTON[n]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** The grid's rows, by pitch from D (high) down to B, one note per row as the original's score view lays them out. */
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
              <span key={i} className={`roll-n ${i < done ? "hit" : ""}`} style={{ left: 20 + x.t * PX, top: `${ROW_OF[x.n] * 10}%`, width: Math.max(26, len * PX - 4) }}>
                <Key n={x.n} small />
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

const BEAT = 620; // ms between notes when the app plays a song's notes

export function Ocarina({ report, onHome, start }: { report: Report | null; onHome: () => void; start?: string | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Play");
  const [song, setSong] = useState<string | null>(start ?? null);
  const [takes, setTakes] = useLocal<Take[]>("ocarina.takes", []);
  const [favs, setFavs] = useLocal<Record<string, true>>("ocarina.favorites", {});
  const [ocId, setOcId] = useLocal("ocarina.instrument", "blue");
  const [owned] = useOwned();
  const [lit, setLit] = useState<Note | null>(null);
  const [bend, setBend] = useState(0);
  const [rec, setRec] = useState<{ n: Note; t: number }[] | null>(null);
  const [naming, setNaming] = useState<Take["notes"] | null>(null);
  const [name, setName] = useState("");
  const [guided, setGuided] = useState(false);
  const [mode, setMode] = useState<"Play only the beginning" | "Play the full version">("Play only the beginning");
  const [list, setList] = useState<"Link's Scores" | "Favorites">("Link's Scores");
  const [at, setAt] = useState(0);
  const [demoAt, setDemoAt] = useState(-1);
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState<Take | null>(null);
  const [sharing, setSharing] = useState<Take | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [head, setHead] = useState<number | null>(null);
  const [playing, setPlaying] = useState<{ stop: () => void; secs: number; t0: number } | null>(null);
  const [now, setNow] = useState(0);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);
  const held = useRef(new Map<Note, Held>());
  const card = useRef<HTMLDivElement>(null);
  const mine = OCARINAS.filter((o) => !o.reward || owned[o.reward]);
  const ocarina = mine.find((o) => o.id === ocId) ?? OCARINAS[0];
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 1800); };
  const stopAll = () => {
    timers.current.forEach(clearTimeout); timers.current = []; cancelAnimationFrame(raf.current); setHead(null); setDemoAt(-1);
    setPlaying((p) => { p?.stop(); return null; });
  };
  /** Moves the playhead across `len` milliseconds. */
  const runHead = (len: number) => {
    const t0 = performance.now();
    const step = () => { const t = performance.now() - t0; if (t > len) return setHead(null); setHead(t); raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => { preload(ocarina.voice); }, [ocarina.voice]);
  useEffect(() => stopAll, []);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => { const e = (performance.now() - playing.t0) / 1000; if (e > playing.secs) setPlaying(null); else setNow(e); }, 100);
    return () => clearInterval(t);
  }, [playing]);

  const known = new Set((cat(report, "songs")?.entries ?? []).filter((e) => e.have).map((e) => e.label));
  const seq = song ? SONGS[song] ?? [] : [];
  const play = (n: Note, ms = 380) => { playNote(ocarina.voice, n, ms); setLit(n); setTimeout(() => setLit(null), ms); };

  const down = useCallback((n: Note) => {
    held.current.get(n)?.stop();
    held.current.set(n, startNote(ocarina.voice, n, bend));
    setLit(n);
    setRec((r) => (r ? [...r, { n, t: performance.now() }] : r));
    if (song && guided) setAt((a) => (seq[a] === n ? (a + 1 >= seq.length ? (flash("Well played!"), 0) : a + 1) : a));
  }, [song, guided, seq, ocarina, bend]);
  const up = useCallback((n: Note) => {
    held.current.get(n)?.stop();
    held.current.delete(n);
    setLit((l) => (l === n ? null : l));
  }, []);

  useEffect(() => {
    const isText = (e: KeyboardEvent) => e.target instanceof HTMLInputElement;
    const kd = (e: KeyboardEvent) => {
      if (isText(e) || e.repeat) return;
      if (e.key === "q" || e.key === "e") return setBend(e.key === "q" ? -1 : 1);
      const n = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (n) { e.preventDefault(); down(n); }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "e") return setBend(0);
      const n = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (n) up(n);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [down, up]);

  /** Plays the song's notes with the game's note sounds, lighting each on the staff. */
  const demo = () => {
    stopAll(); setGuided(false);
    seq.forEach((n, i) => timers.current.push(window.setTimeout(() => { play(n, 520); setDemoAt(i); }, i * BEAT)));
    timers.current.push(window.setTimeout(() => setDemoAt(-1), seq.length * BEAT + 300));
  };
  /** Plays the game's own recording of the whole song. */
  const full = async () => {
    stopAll(); setGuided(false);
    const id = song && SONG_IDS[song];
    const r = id ? await playRecording(`Ocarina_${id}`) : null;
    if (!r) return flash("The game's recording could not be read");
    setPlaying({ ...r, t0: performance.now() });
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
            <button key={o.id} className={`oc-opt ${o.id === ocarina.id ? "on" : ""}`} disabled={!have} onClick={() => { setOcId(o.id); setChoosing(false); preload(o.voice); playNote(o.voice, "R"); }}>
              {pic ? <img src={pic} alt="" /> : <span className="glyph">♪</span>}
              <b>{have ? o.name : "???"}</b>
              <small>{have ? (o.id === ocarina.id ? "Playing" : "Tap to play") : "A Rumor Hunt reward"}</small>
            </button>
          );
        })}
      </div>
    </Sheet>
  );

  const keys = <Keys lit={lit} onDown={down} onUp={up} bend={bend} setBend={setBend} />;

  // ---------- one of the player's own scores ----------
  if (open) {
    return (
      <>
        <Header title={open.name} left="back" onLeft={() => { stopAll(); setOpen(null); }} sub="Original Scores" />
        <div className="scroll grain">
          <Instrument lit={lit} ocarina={ocarina} />
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
    const whole = mode === "Play the full version";
    return (
      <>
        <Header title={song} left="back" onLeft={() => { stopAll(); setSong(null); setGuided(false); setAt(0); }} sub="Game Scores"
          right={<button className={`icon-btn fav ${favs[song] ? "on" : ""}`} aria-label="Add to favorites" onClick={() => { const f = { ...favs }; if (f[song]) delete f[song]; else f[song] = true; setFavs(f); }}>{favs[song] ? "★" : "☆"}</button>} />
        <div className="scroll grain">
          <Instrument lit={lit} ocarina={ocarina} />
          <div className="transport">
            <button className="tp" aria-label="Back to the start" onClick={() => { stopAll(); setAt(0); }}>⏮</button>
            {playing ? <button className="tp big" aria-label="Stop" onClick={stopAll}>■</button>
              : <button className="tp big" aria-label="Play" onClick={whole ? full : demo}>▶</button>}
            {!whole && <button className={`pillbtn ${guided ? "lit" : ""}`} onClick={() => { stopAll(); setGuided(!guided); setAt(0); }}>♪ Guided Play</button>}
          </div>
          <div style={{ margin: ".6em 1em" }}><Seg items={["Play only the beginning", "Play the full version"] as const} value={mode} onChange={(m) => { stopAll(); setMode(m); setAt(0); }} /></div>
          <div className="staff-wrap"><Staff notes={seq} done={guided ? at : 0} at={demoAt} /></div>
          {whole ? (
            <>
              <div className="rec-bar"><i style={{ width: `${playing ? (100 * now) / playing.secs : 0}%` }} /></div>
              <p className="note">The full version is the game's own recording of {song}, read from your game files.</p>
            </>
          ) : (
            <>
              {guided && keys}
              <p className="note">{guided ? "Play the notes in order with the buttons, or the keyboard: L R A Y X." : "Press ▶ to hear it, or Guided Play to play along."}</p>
            </>
          )}
        </div>
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  const songs = Object.keys(SONGS).filter((s) => list === "Link's Scores" || favs[s]);
  return (
    <>
      <Header title="Ocarina" onLeft={onHome}
        help="Play the game's own ocarina sounds with its buttons: L R A Y X (D F A B D) on the keyboard too, or Enter and the arrow keys as in the original. Hold ♭ or ♯ (keyboard Q or E) to bend a note by a semitone, as in the game. Record a performance and name it, learn the songs you have found, and share your own scores as a QR card or a code. More ocarinas can be bought with Rumor Hunt points." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} icons={TAB_ICONS} />
      <div className="scroll grain">
        {tab === "Play" && (
          <>
            <Instrument lit={lit} ocarina={ocarina} />
            {keys}
            <div className="oc-actions">
              {rec ? <button className="btn" onClick={stopRec}>■ Stop ({rec.length})</button> : <button className="btn ghost" onClick={() => setRec([])}>● Record Performance</button>}
              <button className="pillbtn" onClick={() => setChoosing(true)}>⇄ Change Ocarina</button>
            </div>
            {rec && <Roll notes={rec.map((x) => ({ n: x.n, t: x.t - rec[0].t }))} />}
            <p className="note">Playing the {ocarina.name}. Keyboard: L R A Y X, or Enter and the arrows; hold Q or E for ♭ or ♯.</p>
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
