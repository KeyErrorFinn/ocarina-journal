import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../components/chrome";
import { QUIZ, type Q } from "../data/content";
import { useLocal } from "../store";

const LEVELS = [
  { id: "egg", name: "Egg Level", count: 10, secs: 15, icon: "🥚" },
  { id: "cucco", name: "Cucco Level", count: 20, secs: 15, icon: "🐔" },
  { id: "cojiro", name: "Cojiro Challenge", count: 20, secs: 8, icon: "🐤" },
] as const;
type Level = (typeof LEVELS)[number];

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
function build(level: Level): (Q & { order: number[] })[] {
  return shuffle(QUIZ).slice(0, level.count).map((q) => ({ ...q, order: shuffle([0, 1, 2, 3]) }));
}

export function Quiz({ onHome }: { onHome: () => void }) {
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

  const unlocked = (l: Level) => l.id !== "cojiro" || (best.cucco ?? 0) >= 20;
  const start = (l: Level) => { setLvl(l); setQs(build(l)); setI(0); setStreak(0); setPicked(null); setCount(3); setPhase("ready"); };

  useEffect(() => {
    if (phase !== "ready" || !lvl) return;
    if (count === 0) { setLeft(lvl.secs); setPhase("ask"); return; }
    const t = window.setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, count, lvl]);

  useEffect(() => {
    if (phase !== "ask") return;
    tick.current = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(tick.current);
  }, [phase, i]);
  useEffect(() => { if (phase === "ask" && left <= 0) answer(-1); /* eslint-disable-next-line */ }, [left, phase]);

  const finish = (n: number) => {
    setBest((b) => ({ ...b, [lvl!.id]: Math.max(b[lvl!.id] ?? 0, n) }));
    setPhase("end");
  };
  function answer(opt: number) {
    clearInterval(tick.current);
    const q = qs[i];
    const ok = opt >= 0 && q.order[opt] === q.ok;
    setPicked(opt); setPhase("result");
    const n = ok ? streak + 1 : streak;
    setStreak(n);
    setTimeout(() => {
      if (!ok || i + 1 >= qs.length) return finish(n);
      setI(i + 1); setPicked(null); setLeft(lvl!.secs); setPhase("ask");
    }, 1300);
  }

  const q = qs[i];
  const ringP = useMemo(() => `${Math.max(0, (left / (lvl?.secs ?? 15)) * 100)}%`, [left, lvl]);

  if (!lvl) {
    return (
      <>
        <Header title="Quiz" onLeft={onHome} help="Answer until you miss. Your longest streak per level is saved on this PC. The questions are written for this app." />
        <div className="scroll grain">
          {LEVELS.map((l) => (
            <button key={l.id} className={`levelcard ${unlocked(l) ? "" : "locked"}`} disabled={!unlocked(l)} onClick={() => start(l)}>
              <div className="lv"><div style={{ font: "800 1.1em var(--body)" }}>{l.name}</div>
                <div className="small muted">{unlocked(l) ? `Highest number of consecutive correct answers` : "Reach 20/20 on Cucco Level to unlock"}</div></div>
              <span className="num" style={{ fontSize: "1.3em" }}>{best[l.id] ?? 0}/{l.count}</span>
              <span style={{ fontSize: "2.4em" }}>{unlocked(l) ? l.icon : "🔒"}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (phase === "ready") {
    return (
      <div className="scroll" style={{ display: "grid", placeItems: "center", background: "#0b0807" }}>
        <div className="ring" style={{ ["--p" as string]: "75%", width: "8em", height: "8em", fontSize: "2em" }}><span>{count || "Go"}</span></div>
        <button className="btn ghost" style={{ position: "absolute", bottom: "1.5em" }} onClick={() => setLvl(null)}>Return to Quiz Selection</button>
      </div>
    );
  }
  if (phase === "end") {
    return (
      <>
        <Header title={lvl.name} left="back" onLeft={() => setLvl(null)} sub="Result" />
        <div className="scroll grain" style={{ textAlign: "center" }}>
          <p className="muted" style={{ marginTop: "2em" }}>Consecutive correct answers</p>
          <div className="big" style={{ fontSize: "4.4em" }}>{streak}</div>
          <p className="small muted">Record: {Math.max(best[lvl.id] ?? 0, streak)}/{lvl.count}</p>
          <button className="btn block" onClick={() => start(lvl)}>Try again</button>
          <button className="btn ghost block" onClick={() => setLvl(null)}>Return to Quiz Selection</button>
        </div>
      </>
    );
  }
  const q2 = q!;
  return (
    <>
      <div className="band" style={{ padding: ".9em 1.1em", background: "#3b2a1a", display: "flex", justifyContent: "space-between" }}>
        <b>Question {i + 1}</b><span className="muted">{lvl.name}</span>
      </div>
      <div className="scroll" style={{ background: "#0f0b08" }}>
        <p style={{ font: "800 1.4em var(--body)", padding: "1.4em 1.2em .6em", lineHeight: 1.3, minHeight: "6em" }}>{q2.q}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 1.2em" }}>
          <div className="ring" style={{ ["--p" as string]: ringP }}><span>{Math.max(0, left)}</span></div>
        </div>
        <div className="qgrid">
          {q2.order.map((src, k) => {
            const isOk = src === q2.ok;
            const shown = phase === "result";
            return (
              <button key={k} className={`qopt ${shown && isOk ? "ok" : ""} ${shown && picked === k && !isOk ? "bad" : ""}`} disabled={shown} onClick={() => answer(k)}>
                {q2.a[src]}
                {shown && isOk && <span className="mark" style={{ color: "#5fd08a" }}>✓</span>}
                {shown && picked === k && !isOk && <span className="mark" style={{ color: "#e06a5a" }}>✗</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
