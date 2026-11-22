import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../components/chrome";
import { QUIZ, type Q } from "../data/content";
import { useLocal } from "../store";
import { useLore, type Lore } from "../lore";
import { useMapIndex, type MapIndex } from "../maps";
import { MapCrop } from "../components/MapCrop";
import { Rosette } from "../components/medals";

// Question counts as in the original (Egg 20, Cucco 30); the Cojiro Challenge's length is our guess [U].
const LEVELS = [
  { id: "egg", name: "Egg Level", count: 20, secs: 15, icon: "egg" },
  { id: "cucco", name: "Cucco Level", count: 30, secs: 15, icon: "bird" },
  { id: "cojiro", name: "Cojiro Challenge", count: 30, secs: 10, icon: "chick" },
] as const;
type Level = (typeof LEVELS)[number];

/** A question: written for this app, or made from the player's game text and maps. `place` shows that spot on the
 *  game's world map; a second line of `q` is a quoted description. */
type Quest = Q & { place?: string };

/** Level pictures painted for this app (src/assets/quiz); the drawn ones are the fallback. */
const PICS = import.meta.glob<string>("../assets/quiz/*.webp", { eager: true, import: "default" });
const PIC_OF: Record<string, string> = { egg: "egg", bird: "cucco", chick: "cojiro" };

const Icon = ({ k }: { k: string }) => {
  const pic = PIC_OF[k] && PICS[`../assets/quiz/${PIC_OF[k]}.webp`];
  return pic ? <img src={pic} alt="" width={48} height={48} style={{ width: "3em", height: "3em", objectFit: "contain" }} /> : <DrawnIcon k={k} />;
};

const DrawnIcon = ({ k }: { k: string }) => (
  <svg viewBox="0 0 40 40" width="2.6em" height="2.6em" aria-hidden>
    {k === "egg" && <ellipse cx="20" cy="22" rx="10" ry="13" fill="#e9c48a" stroke="#7a5230" strokeWidth="2" />}
    {k === "bird" && (
      <g stroke="#7a5230" strokeWidth="2">
        <ellipse cx="20" cy="24" rx="12" ry="10" fill="#f6efe0" />
        <circle cx="26" cy="13" r="6" fill="#f6efe0" />
        <path d="M24 7l2-4 3 4z" fill="#d65a4f" />
        <path d="M31 13l5 2-5 2z" fill="#e8a33d" />
      </g>
    )}
    {k === "chick" && (
      <g stroke="#7a5230" strokeWidth="2">
        <circle cx="20" cy="22" r="11" fill="#f2c94c" />
        <path d="M29 19l6 2-6 2z" fill="#e8a33d" />
        <circle cx="24" cy="18" r="1.4" fill="#3b2815" />
      </g>
    )}
    {k === "lock" && (
      <g stroke="#cdb99c" strokeWidth="2.4" fill="none">
        <rect x="9" y="18" width="22" height="16" rx="2" fill="#5a4129" />
        <path d="M13 18v-5a7 7 0 0114 0v5" />
      </g>
    )}
  </svg>
);

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const pick = <T,>(a: T[], n: number, not: T) => shuffle(a.filter((x) => x !== not)).slice(0, n);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Hides a name (and each of its longer words) in a description, so the description does not give the answer away. */
function mask(text: string, name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => esc(w.replace(/s$/, "")));
  return words.reduce((t, w) => t.replace(new RegExp(`\\b${w}(e?s)?\\b`, "gi"), "???"), text);
}

/** Questions made from the player's own game: item and enemy descriptions, and places on the world map. */
function generated(lore: Lore | null, idx: MapIndex | null): Quest[] {
  if (!lore) return [];
  const out: Quest[] = [];
  const from = (list: [string, string][], ask: string) => {
    const names = [...new Set(list.map(([n]) => n))];
    for (const [n, cap] of list) {
      const text = mask(cap, n);
      if (text.length < 40 || text.length > 230) continue;
      out.push({ q: `${ask}\n“${text}”`, a: [n, ...pick(names, 3, n)] as Quest["a"], ok: 0 });
    }
  };
  from(lore.items, "Which item is this?");
  from(lore.enemies, "Which enemy is this?");
  if (idx) {
    const ids = Object.keys(idx.world.labels).filter((id) => lore.places[id] && !idx.places[id]?.dungeon);
    const names = ids.map((id) => lore.places[id]);
    for (const id of ids)
      out.push({ q: "Which map location is this?", place: id, a: [lore.places[id], ...pick(names, 3, lore.places[id])] as Quest["a"], ok: 0 });
  }
  return out;
}

function build(level: Level, extra: Quest[]): (Quest & { order: number[] })[] {
  // The Egg Level leans on the written questions; the harder levels draw mostly from the game's own text.
  const pool: Quest[] = level.id === "egg" ? [...QUIZ, ...shuffle(extra).slice(0, 40)] : [...shuffle(QUIZ).slice(0, 8), ...extra];
  return shuffle(pool)
    .slice(0, level.count)
    .map((q) => ({ ...q, order: shuffle([0, 1, 2, 3]) }));
}

/** Medal tier (0 none .. 3 gold) for a best streak: a quarter, half or three quarters of the level. */
const tierOf = (n: number, count: number) => (n >= count * 0.75 ? 3 : n >= count * 0.5 ? 2 : n >= count * 0.25 ? 1 : 0);

export function Quiz({ onHome }: { onHome: () => void }) {
  const lore = useLore();
  const idx = useMapIndex();
  const extra = useMemo(() => generated(lore, idx), [lore, idx]);
  const [best, setBest] = useLocal<Record<string, number>>("quiz.best", {});
  const [lvl, setLvl] = useState<Level | null>(null);
  const [qs, setQs] = useState<ReturnType<typeof build>>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"ready" | "ask" | "result" | "end">("ready");
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(15);
  const [picked, setPicked] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const tick = useRef<number | undefined>(undefined);

  const unlocked = (l: Level) => l.id !== "cojiro" || (best.cucco ?? 0) >= LEVELS[1].count;
  const start = (l: Level) => {
    setLvl(l);
    setQs(build(l, extra));
    setI(0);
    setStreak(0);
    setPicked(null);
    setCount(3);
    setPhase("ready");
  };

  useEffect(() => {
    if (phase !== "ready" || !lvl) return;
    if (count === 0) {
      setLeft(lvl.secs);
      setPhase("ask");
      return;
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, count, lvl]);

  useEffect(() => {
    if (phase !== "ask") return;
    tick.current = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(tick.current);
  }, [phase, i]);
  // (time running out answers wrong; `answer` is a new function each render, so it is left out on purpose)
  useEffect(() => {
    if (phase === "ask" && left <= 0) answer(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase]);

  const finish = (n: number) => {
    setBest((b) => ({ ...b, [lvl!.id]: Math.max(b[lvl!.id] ?? 0, n) }));
    setPhase("end");
  };
  function answer(opt: number) {
    clearInterval(tick.current);
    const q = qs[i];
    const ok = opt >= 0 && q.order[opt] === q.ok;
    setPicked(opt);
    setPhase("result");
    const n = ok ? streak + 1 : streak;
    setStreak(n);
    setTimeout(() => {
      if (!ok || i + 1 >= qs.length) return finish(n);
      setI(i + 1);
      setPicked(null);
      setLeft(lvl!.secs);
      setPhase("ask");
    }, 1300);
  }

  const q = qs[i];
  const ringP = useMemo(() => `${Math.max(0, (left / (lvl?.secs ?? 15)) * 100)}%`, [left, lvl]);

  if (!lvl) {
    return (
      <>
        <Header
          title="Quiz"
          onLeft={onHome}
          help="Answer until you miss. Your longest streak per level is saved on this PC, with a medal at a quarter, half and three quarters of the level. Some questions are written for this app; the rest are made from your game's own item and enemy descriptions and its world map."
        />
        <div className="scroll grain">
          {LEVELS.map((l) => (
            <button key={l.id} className={`levelcard ${unlocked(l) ? "" : "locked"}`} disabled={!unlocked(l)} onClick={() => start(l)}>
              <div className="lv">
                <div style={{ font: "800 1.1em var(--body)" }}>{l.name}</div>
                <div className="small muted">
                  {unlocked(l) ? "Highest number of consecutive correct answers" : `Reach ${LEVELS[1].count}/${LEVELS[1].count} on Cucco Level to unlock`}
                </div>
              </div>
              <span className="num" style={{ fontSize: "1.3em" }}>
                {best[l.id] ?? 0}/{l.count}
              </span>
              {unlocked(l) && tierOf(best[l.id] ?? 0, l.count) > 0 && (
                <span className="qmedal">
                  <Rosette tier={tierOf(best[l.id] ?? 0, l.count)} />
                </span>
              )}
              <Icon k={unlocked(l) ? l.icon : "lock"} />
            </button>
          ))}
          <p className="note">
            {extra.length
              ? `${QUIZ.length + extra.length} questions, ${extra.length} of them from your game's files.`
              : `${QUIZ.length} written questions. More are made from your game's files once its folder is found.`}
          </p>
        </div>
      </>
    );
  }

  if (phase === "ready") {
    return (
      <div className="scroll" style={{ display: "grid", placeItems: "center", background: "#0b0807" }}>
        <div className="ring" style={{ ["--p" as string]: "75%", width: "8em", height: "8em", fontSize: "2em" }}>
          <span>{count || "Go"}</span>
        </div>
        <button className="btn ghost" style={{ position: "absolute", bottom: "1.5em" }} onClick={() => setLvl(null)}>
          Return to Quiz Selection
        </button>
      </div>
    );
  }
  if (phase === "end") {
    const tier = tierOf(Math.max(best[lvl.id] ?? 0, streak), lvl.count);
    return (
      <>
        <Header title={lvl.name} left="back" onLeft={() => setLvl(null)} sub="Result" />
        <div className="scroll grain" style={{ textAlign: "center" }}>
          <p className="muted" style={{ marginTop: "2em" }}>
            Consecutive correct answers
          </p>
          <div className="big" style={{ fontSize: "4.4em" }}>
            {streak}
          </div>
          <p className="small muted">
            Record: {Math.max(best[lvl.id] ?? 0, streak)}/{lvl.count}
          </p>
          {tier > 0 && (
            <div className="qmedal" style={{ width: "4.4em", height: "5.2em", margin: ".6em auto" }}>
              <Rosette tier={tier} />
            </div>
          )}
          <button className="btn block" onClick={() => start(lvl)}>
            Try again
          </button>
          <button className="btn ghost block" onClick={() => setLvl(null)}>
            Return to Quiz Selection
          </button>
        </div>
      </>
    );
  }
  const q2 = q!;
  const [ask, quote] = q2.q.split("\n");
  return (
    <>
      <div className="qhead">
        <span>
          Question <b>{i + 1}</b>
        </span>
        <span className="muted small">{lvl.name}</span>
      </div>
      <div className="scroll" style={{ background: "#0f0b08" }}>
        <div className="qcard">
          {q2.place && idx && (
            <div className="shot">
              <MapCrop idx={idx} place={q2.place} zoom={4} />
            </div>
          )}
          <p className="qtext">{ask}</p>
          {quote && <p className="qquote">{quote}</p>}
          <div className="ring qring" style={{ ["--p" as string]: ringP }}>
            <span>{Math.max(0, left)}</span>
          </div>
        </div>
        <div className="qlist">
          {q2.order.map((src, k) => {
            const isOk = src === q2.ok;
            const shown = phase === "result";
            return (
              <button
                key={k}
                className={`qopt ${shown && isOk ? "ok" : ""} ${shown && picked === k && !isOk ? "bad" : ""}`}
                disabled={shown}
                onClick={() => answer(k)}
              >
                {q2.a[src]}
                {shown && isOk && (
                  <span className="mark" style={{ color: "#5fd08a" }}>
                    ✓
                  </span>
                )}
                {shown && picked === k && !isOk && (
                  <span className="mark" style={{ color: "#e06a5a" }}>
                    ✗
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
