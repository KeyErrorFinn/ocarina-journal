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

export const Back = () => (
  <I>
    <path d="M15 5l-7 7 7 7" />
  </I>
);
export const Home = () => (
  <I>
    <path d="M4 11l8-7 8 7M6 10v9h12v-9" />
  </I>
);
export const Close = () => (
  <I>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
);
export const Refresh = () => (
  <I>
    <path d="M20 6v5h-5M4 18v-5h5M18 11a7 7 0 00-12-3M6 13a7 7 0 0012 3" />
  </I>
);
/** A cog with eight teeth around a hub: the settings button. */
export const Gear = () => (
  <I>
    <path d="M10.1 4.85L10.31 2.14H13.69L13.9 4.85A7.4 7.4 0 0 1 15.71 5.6L17.77 3.83L20.17 6.23L18.4 8.29A7.4 7.4 0 0 1 19.15 10.1L21.86 10.31V13.69L19.15 13.9A7.4 7.4 0 0 1 18.4 15.71L20.17 17.77L17.77 20.17L15.71 18.4A7.4 7.4 0 0 1 13.9 19.15L13.69 21.86H10.31L10.1 19.15A7.4 7.4 0 0 1 8.29 18.4L6.23 20.17L3.83 17.77L5.6 15.71A7.4 7.4 0 0 1 4.85 13.9L2.14 13.69V10.31L4.85 10.1A7.4 7.4 0 0 1 5.6 8.29L3.83 6.23L6.23 3.83L8.29 5.6A7.4 7.4 0 0 1 10.1 4.85z" />
    <circle cx="12" cy="12" r="3.1" />
  </I>
);
/** A pulse line: how the app is linked to the game. */
export const Pulse = () => (
  <I>
    <path d="M2.5 12.5h4l2.2-5.5 4.6 11 2.5-5.5h5.7" />
  </I>
);
/** A folder. */
export const Folder = () => (
  <I>
    <path d="M3.5 7V17.5A1.5 1.5 0 005 19h14a1.5 1.5 0 001.5-1.5v-8A1.5 1.5 0 0019 8h-7.2l-1.9-2.5H5A1.5 1.5 0 003.5 7z" />
  </I>
);
/** A monitor with a small handheld screen beside it: showing the journal on another screen. */
export const Screens = () => (
  <I>
    <rect x="2.5" y="4.5" width="11" height="9" rx="1.5" />
    <path d="M5.5 18h5M8 13.5V18" />
    <rect x="15.5" y="8" width="6" height="11.5" rx="1.2" />
    <path d="M17.8 17.3h1.4" />
  </I>
);
/** A window frame with its title bar. */
export const WindowFrame = () => (
  <I>
    <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
    <path d="M3 9h18M6 6.8h.01M8.5 6.8h.01" />
  </I>
);
/** A circled "i". */
export const Info = () => (
  <I>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.1" />
  </I>
);
/** Two overlapping sheets: copy to the clipboard. */
export const Copy = () => (
  <I>
    <rect x="8.5" y="8.5" width="11" height="12" rx="1.5" />
    <path d="M15.5 8.5V5A1.5 1.5 0 0014 3.5H6A1.5 1.5 0 004.5 5v10A1.5 1.5 0 006 16.5h2.5" />
  </I>
);
/** A tick. */
export const Check = () => (
  <I>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </I>
);
/** A navigation arrowhead (the "go to Link" button). */
export const Locate = () => (
  <I>
    <path d="M12 2.8l7.5 17.4c.2.5-.3 1-.8.8L12 17.2l-6.7 3.8c-.5.2-1-.3-.8-.8z" fill="currentColor" fillOpacity=".22" />
  </I>
);
/** A funnel: the filter button. */
export const Funnel = () => (
  <I>
    <path d="M4 5.5h16l-6 7v5.7l-4 2v-7.7z" fill="currentColor" fillOpacity=".22" />
  </I>
);
export const Filter = Funnel;
/** Two stacked chevrons pointing up; the map's exits turn it toward where they lead. */
export const ExitArrow = () => (
  <I>
    <path d="M6.5 11L12 5.5 17.5 11M6.5 18.5L12 13l5.5 5.5" />
  </I>
);
export const Chevron = () => (
  <I>
    <path d="M7 14l5-5 5 5" />
  </I>
);

// Home-tile glyphs
export const GMap = () => (
  <I>
    <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" />
    <path d="M9 4v14M15 6v14" />
  </I>
);
export const GScroll = () => (
  <I>
    <path d="M6 4h11a2 2 0 012 2v11a3 3 0 01-3 3H8a3 3 0 01-3-3V5" />
    <path d="M9 9h7M9 13h7" />
  </I>
);
export const GMedal = () => (
  <I>
    <circle cx="12" cy="9" r="5" />
    <path d="M9 13.5L7 21l5-3 5 3-2-7.5" />
  </I>
);
export const GSkull = () => (
  <I>
    <path d="M5 11a7 7 0 0114 0v3a2 2 0 01-2 2v3h-3v-2h-4v2H7v-3a2 2 0 01-2-2z" />
    <circle cx="9.5" cy="11.5" r="1.2" />
    <circle cx="14.5" cy="11.5" r="1.2" />
  </I>
);
export const GTapestry = () => (
  <I>
    <path d="M4 4h16M6 4v14l6 3 6-3V4M12 8v8M9 11h6" />
  </I>
);
export const GCamera = () => (
  <I>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M8 7l1.5-3h5L16 7" />
    <circle cx="12" cy="13" r="3.2" />
  </I>
);
export const GOcarina = () => (
  <I>
    <path d="M4 12c0-4 4-7 9-6 4 1 7 4 7 6 0 3-4 6-9 5-4-1-7-2-7-5z" />
    <circle cx="10" cy="10" r=".8" />
    <circle cx="13.5" cy="9.5" r=".8" />
    <circle cx="14" cy="13" r=".8" />
  </I>
);
export const GQuiz = () => (
  <I>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 17h.01" />
  </I>
);
export const GRumor = () => (
  <I>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9h8M8 12h5" />
  </I>
);
export const Grid = () => (
  <I>
    <rect x="4" y="4" width="6.5" height="6.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" />
  </I>
);
export const GHistory = () => (
  <I>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7v5l3 2" />
    <path d="M4 4v4h4" />
  </I>
);
export const GAmiibo = () => (
  <I>
    <ellipse cx="12" cy="19" rx="7" ry="2.5" />
    <circle cx="12" cy="7" r="3" />
    <path d="M8 18c0-5 2-7 4-7s4 2 4 7" />
  </I>
);
export const GChart = () => (
  <I>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </I>
);

export function Heart({ fill }: { fill: number }) {
  // fill in 0..1; clips a solid heart over an empty one.
  const id = `h${Math.random().toString(36).slice(2, 8)}`;
  const path = "M12 21s-8-5.3-8-11a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 5.7-8 11-8 11z";
  return (
    <svg viewBox="0 0 24 24">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
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
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
    </>
  ),
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
      <g
        transform="translate(20 20)"
        fill="none"
        stroke={tier === "locked" ? "#4a3b2d" : "#3a2713"}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {tier === "locked" ? <path d="M6 8a6 6 0 1112 0c0 4-6 4-6 9M12 22v.5" /> : (GLYPH[glyph] ?? GLYPH.gem)}
      </g>
    </svg>
  );
}
