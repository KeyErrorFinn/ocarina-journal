import type { JSX } from "react";
import type { MapKind } from "../report";

/** Painted map markers made for this app (src/assets/markers): a medallion per kind, and a greyed "done" version with a
 *  check. The drawn markers below are the fallback. */
const MARKS = import.meta.glob<string>("../assets/markers/*.webp", { eager: true, import: "default" });
const mark = (name: string, done?: boolean) => MARKS[`../assets/markers/mk_${name}${done ? "_done" : ""}.webp`];
const MARK_OF: Record<string, string> = {
  chests: "chest",
  skulltulas: "token",
  "heart-pieces": "heart_piece",
  "heart-containers": "heart",
  stone: "stone",
  grotto: "grotto",
  cow: "cow",
  owl: "owl",
  scarecrow: "scarecrow",
  frog: "frog",
  beehive: "beehive",
};
function Painted({ kind, done }: { kind: string; done?: boolean }) {
  const pic = MARK_OF[kind] && (mark(MARK_OF[kind], done) ?? mark(MARK_OF[kind]));
  return pic ? <img className="mk-pic" src={pic} alt="" draggable={false} /> : null;
}

/** Map markers drawn for this app. */
export function Marker({ kind, done }: { kind: MapKind; done?: boolean }) {
  const pic = <Painted kind={kind} done={done} />;
  if (MARK_OF[kind] && mark(MARK_OF[kind])) return pic;
  const op = done ? 0.45 : 1;
  switch (kind) {
    case "chests":
      return (
        <svg viewBox="0 0 32 32" opacity={op}>
          <rect x="5" y="11" width="22" height="15" rx="2" fill="#c8742f" stroke="#5a2e0c" strokeWidth="2" />
          <path d="M5 16h22M5 11a11 6 0 0122 0" fill="#e39a4a" stroke="#5a2e0c" strokeWidth="2" />
          <rect x="14" y="15" width="4" height="5" fill="#f4d77a" stroke="#5a2e0c" strokeWidth="1.4" />
        </svg>
      );
    case "skulltulas":
      return (
        <svg viewBox="0 0 32 32" opacity={op}>
          <circle cx="16" cy="16" r="12" fill="#f2c94c" stroke="#6b4a08" strokeWidth="2" />
          <path d="M9 14c0-4 3-7 7-7s7 3 7 7v3l-2 1v3h-3v-2h-4v2H11v-3l-2-1z" fill="#6b4a08" />
          <circle cx="13" cy="14" r="2" fill="#f2c94c" />
          <circle cx="19" cy="14" r="2" fill="#f2c94c" />
        </svg>
      );
    case "heart-pieces":
      return (
        <svg viewBox="0 0 32 32" opacity={op}>
          <circle cx="16" cy="16" r="13" fill="#f6efe0" stroke="#7a6a50" strokeWidth="2" />
          <path d="M16 24c-7-5-9-9-6-12 2-2 5-1 6 1 1-2 4-3 6-1 3 3 1 7-6 12z" fill="#d65a4f" stroke="#7a1f1a" strokeWidth="1.6" />
        </svg>
      );
    case "heart-containers":
      return (
        <svg viewBox="0 0 32 32" opacity={op}>
          <path d="M16 28C5 20 2 13 6 8c3-3 8-2 10 2 2-4 7-5 10-2 4 5 1 12-10 20z" fill="#e0453a" stroke="#6b130d" strokeWidth="2" />
          <path d="M10 11c1-1 3-1 4 1" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Landmark markers drawn for this app (Rumor Hunt places on the map). */
export function LandIcon({ kind, done }: { kind: import("../landmarks").LandKind; done?: boolean }) {
  if (mark(MARK_OF[kind])) return <Painted kind={kind} done={done} />;
  const g: Record<string, JSX.Element> = {
    stone: (
      <>
        <path d="M10 27c0-9 2-17 6-19s7 6 7 19z" fill="#9aa3a8" stroke="#3a3f44" strokeWidth="1.6" />
        <path d="M14 18a2.5 2.5 0 103.5 2" fill="none" stroke="#3a3f44" strokeWidth="1.4" />
      </>
    ),
    grotto: (
      <>
        <ellipse cx="16" cy="19" rx="10" ry="6" fill="#2a1d14" stroke="#c8a46a" strokeWidth="1.8" />
        <path d="M9 17c3-3 11-3 14 0" stroke="#5a4129" strokeWidth="1.4" fill="none" />
      </>
    ),
    cow: (
      <>
        <rect x="10" y="10" width="12" height="12" rx="3" fill="#e8d6a8" stroke="#6b4a2a" strokeWidth="1.6" />
        <path d="M13 22v5h6v-5" fill="#c8a46a" stroke="#6b4a2a" strokeWidth="1.4" />
        <circle cx="16" cy="27" r="1.6" fill="#6b4a2a" />
      </>
    ),
    owl: (
      <>
        <path d="M5 22c6-1 16-1 22 0" stroke="#6b4a2a" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20 21c1-3 4-5 6-5" stroke="#4f9a3e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="12" cy="14" r="4" fill="none" stroke="#c8a46a" strokeWidth="1.6" strokeDasharray="2 2" />
      </>
    ),
    scarecrow: (
      <>
        <path d="M16 9v18M9 14h14" stroke="#6b4a2a" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 9l6-4 6 4z" fill="#d6b35a" stroke="#6b4a2a" strokeWidth="1.2" />
      </>
    ),
    frog: (
      <>
        <ellipse cx="16" cy="22" rx="11" ry="5" fill="#3f8a4a" stroke="#1f4a28" strokeWidth="1.4" />
        <path d="M16 22l9-3" stroke="#1f4a28" strokeWidth="1.2" />
        <circle cx="14" cy="15" r="3" fill="#c8e07a" stroke="#1f4a28" strokeWidth="1.2" />
        <circle cx="19" cy="15" r="3" fill="#c8e07a" stroke="#1f4a28" strokeWidth="1.2" />
      </>
    ),
    beehive: (
      <>
        <path d="M16 6c6 0 9 5 9 11s-4 10-9 10-9-4-9-10 3-11 9-11z" fill="#e8b23a" stroke="#6b4a08" strokeWidth="1.6" />
        <path d="M8 13h16M7.5 18h17M8.5 23h15" stroke="#6b4a08" strokeWidth="1.2" />
        <circle cx="16" cy="25" r="1.6" fill="#3a2608" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 32 32" opacity={done ? 0.45 : 1}>
      <circle cx="16" cy="16" r="15" fill="#1a120bcc" stroke="#d9b25f" strokeWidth="1.2" />
      {g[kind]}
    </svg>
  );
}

/** The Link arrow on maps. */
// A glowing wisp drawn for this app marks Link (the original uses a fairy); the notch points where he faces.
const WISP = Object.values(import.meta.glob<string>("../assets/ocarina/wisp.webp", { eager: true, import: "default" }))[0];
export const LinkArrow = () =>
  WISP ? (
    <span className="wisp">
      <i className="wisp-dir" />
      <img src={WISP} alt="" />
    </span>
  ) : (
    <svg viewBox="0 0 24 24">
      <path d="M12 2l8 20-8-5-8 5z" fill="#c0392b" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );

/** A medal ribbon for a tier. */
export function Ribbon({ tier }: { tier: number }) {
  const cols = ["#b0703a", "#aab4c0", "#e0b43c", "#8c6ad8"];
  const c = tier > 0 ? cols[tier - 1] : "#3a3128";
  return (
    <svg className="ribbon" viewBox="0 0 40 46">
      <path d="M10 28l-5 16 8-4 4 6 3-16zM30 28l5 16-8-4-4 6-3-16z" fill={tier > 0 ? "#3d6fb0" : "#2c2620"} />
      <circle cx="20" cy="17" r="14" fill={c} stroke="#00000066" strokeWidth="2" />
      <path d="M12 14c0-4 3-6 8-6s8 2 8 6v4l-3 1v3h-3v-2h-4v2h-3v-3l-3-1z" fill={tier > 0 ? "#fff8" : "#0004"} />
    </svg>
  );
}

/** An original emblem for an enemy or boss (initials on a crest); not the game's artwork. */
export function Crest({ name }: { name: string }) {
  const ini =
    name
      .replace(/[^A-Za-z ]/g, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <svg viewBox="0 0 48 48">
      <path d="M24 3l17 6v14c0 11-7 18-17 22C14 41 7 34 7 23V9z" fill="#1c140c" stroke="#d9b25f" strokeWidth="2.2" />
      <path d="M24 8l12 4v10c0 8-5 13-12 16-7-3-12-8-12-16V12z" fill="none" stroke="#d9b25f55" />
      <text x="24" y="29" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="14" fill="#d9b25f">
        {ini}
      </text>
    </svg>
  );
}

/** Original forest scene behind the Titles grid. */
export function ForestBg() {
  return (
    <svg className="bg" viewBox="0 0 360 780" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2e22" />
          <stop offset=".5" stopColor="#15221a" />
          <stop offset="1" stopColor="#0b120d" />
        </linearGradient>
        <radialGradient id="glow" cx=".5" cy=".25" r=".7">
          <stop offset="0" stopColor="#7fb36a" stopOpacity=".35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="780" fill="url(#fg)" />
      <rect width="360" height="780" fill="url(#glow)" />
      {[
        [20, 80],
        [90, 140],
        [200, 60],
        [290, 130],
        [340, 40],
        [150, 30],
      ].map(([x, y], i) => (
        <g key={i} opacity=".55">
          <rect x={x - 7} y={y} width="14" height={420 - y} fill="#0f1a12" />
          <ellipse cx={x} cy={y} rx={46 + (i % 3) * 8} ry={34} fill="#1d3624" />
        </g>
      ))}
      {Array.from({ length: 26 }, (_, i) => (
        <circle key={i} cx={(i * 53) % 360} cy={(i * 97) % 780} r={1 + (i % 3)} fill="#b9e08a" opacity=".25" />
      ))}
    </svg>
  );
}
