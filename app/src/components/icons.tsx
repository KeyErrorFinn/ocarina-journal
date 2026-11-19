import type { ReactNode } from "react";

/** Original line icons (24x24). Drawn for this project; not taken from any game or app. */
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function I({ children, view = 24 }: { children: ReactNode; view?: number }) {
  return (
    <svg viewBox={`0 0 ${view} ${view}`} {...base}>
      {children}
    </svg>
  );
}

export const Back = () => (<I><path d="M15 5l-7 7 7 7" /></I>);
export const Home = () => (<I><path d="M4 11l8-7 8 7M6 10v9h12v-9" /></I>);
export const Close = () => (<I><path d="M6 6l12 12M18 6L6 18" /></I>);
export const Refresh = () => (<I><path d="M20 6v5h-5M4 18v-5h5M18 11a7 7 0 00-12-3M6 13a7 7 0 0012 3" /></I>);
export const Gear = () => (<I><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></I>);
export const Locate = () => (<I><path d="M12 3l7 17-7-4-7 4z" /></I>);
export const Filter = () => (<I><path d="M4 7h16M7 12h10M10 17h4" /></I>);
export const Chevron = () => (<I><path d="M7 14l5-5 5 5" /></I>);

// Home-tile glyphs
export const GMap = () => (<I><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" /><path d="M9 4v14M15 6v14" /></I>);
export const GScroll = () => (<I><path d="M6 4h11a2 2 0 012 2v11a3 3 0 01-3 3H8a3 3 0 01-3-3V5" /><path d="M9 9h7M9 13h7" /></I>);
export const GMedal = () => (<I><circle cx="12" cy="9" r="5" /><path d="M9 13.5L7 21l5-3 5 3-2-7.5" /></I>);
export const GSkull = () => (<I><path d="M5 11a7 7 0 0114 0v3a2 2 0 01-2 2v3h-3v-2h-4v2H7v-3a2 2 0 01-2-2z" /><circle cx="9.5" cy="11.5" r="1.2" /><circle cx="14.5" cy="11.5" r="1.2" /></I>);
export const GTapestry = () => (<I><path d="M4 4h16M6 4v14l6 3 6-3V4M12 8v8M9 11h6" /></I>);
export const GCamera = () => (<I><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M8 7l1.5-3h5L16 7" /><circle cx="12" cy="13" r="3.2" /></I>);
export const GOcarina = () => (<I><path d="M4 12c0-4 4-7 9-6 4 1 7 4 7 6 0 3-4 6-9 5-4-1-7-2-7-5z" /><circle cx="10" cy="10" r=".8" /><circle cx="13.5" cy="9.5" r=".8" /><circle cx="14" cy="13" r=".8" /></I>);
export const GQuiz = () => (<I><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 17h.01" /></I>);
export const GRumor = () => (<I><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></I>);
export const Grid = () => (<I><rect x="4" y="4" width="6.5" height="6.5" /><rect x="13.5" y="4" width="6.5" height="6.5" /><rect x="4" y="13.5" width="6.5" height="6.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" /></I>);
export const Dots = () => (<I><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></I>);
export const GHistory = () => (<I><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /><path d="M4 4v4h4" /></I>);
export const GAmiibo = () => (<I><ellipse cx="12" cy="19" rx="7" ry="2.5" /><circle cx="12" cy="7" r="3" /><path d="M8 18c0-5 2-7 4-7s4 2 4 7" /></I>);
export const GChart = () => (<I><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></I>);

export function Heart({ fill }: { fill: number }) {
  // fill in 0..1; clips a solid heart over an empty one.
  const id = `h${Math.random().toString(36).slice(2, 8)}`;
  const path = "M12 21s-8-5.3-8-11a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 5.7-8 11-8 11z";
  return (
    <svg viewBox="0 0 24 24">
      <defs><clipPath id={id}><rect x="0" y="0" width={24 * fill} height="24" /></clipPath></defs>
      <path d={path} fill="#2f2620" stroke="#5b4630" strokeWidth="1.2" />
      <path d={path} fill="#d65a4f" clipPath={`url(#${id})`} />
    </svg>
  );
}

export function Rupee() {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em">
      <path d="M12 2l7 7-7 13-7-13z" fill="#3fb36a" stroke="#cdeed8" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5 9h14M12 2v20" stroke="#cdeed8" strokeWidth=".8" opacity=".6" />
    </svg>
  );
}

const GLYPH: Record<string, ReactNode> = {
  hourglass: <path d="M5 3h14M5 21h14M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9" />,
  gem: <path d="M12 2l8 8-8 12-8-12z" />,
  path: <path d="M4 20c4-2 2-6 6-8s2-6 6-8M16 22l4-2" />,
  sword: <path d="M12 2v14M8 16h8M12 16v6" />,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10" /></>,
};

/** Shield-shaped medal with a tier colour and a glyph. */
export function MedalBadge({ tier, glyph }: { tier: "bronze" | "silver" | "gold" | "locked"; glyph: string }) {
  const colors = {
    bronze: ["#e39a62", "#a8602f"],
    silver: ["#cfd8dc", "#8798a1"],
    gold: ["#f6d36b", "#c18f1d"],
    locked: ["#3b2f25", "#2a211a"],
  }[tier];
  const id = `m${tier}${glyph}`;
  return (
    <svg viewBox="0 0 64 76">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <path d="M20 52l-8 22 20-9 20 9-8-22" fill="#35508a" />
      <path d="M32 2l24 8v22c0 14-10 22-24 28C18 54 8 46 8 32V10z" fill={`url(#${id})`} stroke="#fff3" strokeWidth="2" />
      <g transform="translate(20 20)" fill="none" stroke={tier === "locked" ? "#4a3b2d" : "#3a2713"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {tier === "locked" ? <path d="M6 8a6 6 0 1112 0c0 4-6 4-6 9M12 22v.5" /> : GLYPH[glyph] ?? GLYPH.gem}
      </g>
    </svg>
  );
}
