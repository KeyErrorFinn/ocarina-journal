/** Mirrors `LiveState` in src-tauri/src/lib.rs. */
export interface Game {
  frame: number;
  map: string | null;
  pos: [number, number, number] | null;
  /** Degrees; 0 faces +Z, increasing toward +X (checked against recorded movement). */
  facing?: number | null;
  age: string | null;
  life: number | null;
  max_life: number | null;
  rupees: number | null;
  music: string | null;
  event: boolean;
  loading: boolean;
}

export type Mode = "live" | "bridge_off" | "offline";

export type EntryKind =
  | { type: "area_entered"; entered: string }
  | { type: "battle_started" }
  | { type: "battle_ended"; secs: number }
  | { type: "rupees_gained"; amount: number }
  | { type: "rupees_spent"; amount: number }
  | { type: "damage_taken"; quarters: number }
  | { type: "healed"; quarters: number }
  | { type: "max_life_up"; quarters: number }
  | { type: "died" }
  | { type: "age_changed"; age: string }
  | { type: "scene"; secs: number };

export type Entry = { wall_ms: number; game_t: number; area: string | null } & EntryKind;

export interface Totals {
  play_secs: number;
  by_area: Record<string, number>;
  /** Time by Link's age ("child", "adult"), then area; missing on days saved before it existed. */
  by_age_area?: Record<string, Record<string, number>>;
  distance_units: number;
  rupees_gained: number;
  rupees_spent: number;
  damage_quarters: number;
  deaths: number;
  battles: number;
  battle_secs: number;
  scenes: number;
  areas_visited: string[];
}

export interface Journal {
  started_wall_ms: number;
  totals: Totals;
  /** Newest first. */
  entries: Entry[];
}

export interface SlotSummary {
  slot: string;
  modified_ms: number | null;
  rupees: number | null;
  life: number | null;
  max_life: number | null;
  gold_skulltulas: number | null;
  true_keys: number;
}

/** One save the game wrote and what it changed since that slot's previous save (made by the app from the saves). */
export interface SaveEvent {
  wall_ms: number;
  slot: string;
  map: string | null;
  place: string | null;
  age: "child" | "adult" | null;
  gains: Record<string, number>;
  rupees: number;
}

export interface DaySummary {
  date: string;
  start_ms: number;
  totals: Totals;
}

/** What the last "check for updates" found. */
export interface UpdateInfo {
  latest: string;
  url: string;
  newer: boolean;
}

/** Showing the journal read-only on another screen (a browser on this PC, or on the local network if allowed). */
export interface RemoteInfo {
  enabled: boolean;
  /** Other devices on the network may connect; off means this PC only. */
  lan: boolean;
  /** The address to open on the other screen, while it is on. */
  url: string | null;
  /** The address with the pairing code in it, for the QR code. */
  link: string | null;
  /** The pairing code the other screen must enter. */
  code: string | null;
  /** When the 4-digit code (which changes every minute) stops being the current one, in milliseconds since 1970. The code
   *  itself is not part of the state: ask for it with `get_remote_pin` while it is shown. */
  pin_ends_ms: number | null;
  /** Screens that have paired. */
  screens: RemoteScreen[];
  error: string | null;
}

export interface RemoteScreen {
  id: string;
  /** What the browser says it is, such as "iPhone · Safari". */
  name: string;
  addr: string;
  /** When it paired (milliseconds since 1970). */
  since_ms: number;
  /** Has the page open right now. */
  online: boolean;
}

export interface LiveState {
  bridge_config_supported?: boolean;
  mode: Mode;
  connected: boolean;
  game_running: boolean;
  pipe: string;
  version: string | null;
  game: Game | null;
  samples_dropped: number;
  last_error: string | null;
  journal: Journal;
  save_dir: string | null;
  save_dir_chosen: boolean;
  saves: SlotSummary[];
  app_version: string;
  update_check_auto: boolean;
  update: UpdateInfo | null;
  game_dir: string | null;
  history: DaySummary[];
  save_log: SaveEvent[];
  remote: RemoteInfo;
}

export const EMPTY_TOTALS: Totals = {
  play_secs: 0,
  by_area: {},
  distance_units: 0,
  rupees_gained: 0,
  rupees_spent: 0,
  damage_quarters: 0,
  deaths: 0,
  battles: 0,
  battle_secs: 0,
  scenes: 0,
  areas_visited: [],
};

export const EMPTY: LiveState = {
  mode: "offline",
  connected: false,
  game_running: false,
  pipe: "",
  version: null,
  game: null,
  samples_dropped: 0,
  last_error: null,
  journal: { started_wall_ms: 0, totals: EMPTY_TOTALS, entries: [] },
  save_dir: null,
  save_dir_chosen: false,
  saves: [],
  app_version: "",
  update_check_auto: false,
  update: null,
  game_dir: null,
  history: [],
  save_log: [],
  remote: { enabled: false, lan: false, url: null, link: null, code: null, pin_ends_ms: null, screens: [], error: null },
};

/** The most recently written save slot, if any. */
export function newestSlot(s: LiveState): SlotSummary | null {
  return s.saves[0] ?? null;
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function mins(secs: number): string {
  const m = Math.round(secs / 60);
  return m < 1 ? "<1 min" : `${m} min`;
}

/** One line for a timeline entry. Only states what the bridge can actually observe. */
export function describe(e: Entry): { title: string; detail?: string; key: boolean } {
  const hearts = (q: number) => `${q / 4} ${q === 4 ? "heart" : "hearts"}`;
  switch (e.type) {
    case "area_entered":
      return { title: `Entered ${friendlyMap(e.entered)}`, key: true };
    case "battle_started":
      return { title: "Battle started", detail: e.area ? friendlyMap(e.area) : undefined, key: false };
    case "battle_ended":
      return { title: "Battle ended", detail: `${Math.round(e.secs)} s`, key: false };
    case "rupees_gained":
      return { title: `+${e.amount} rupees`, key: false };
    case "rupees_spent":
      return { title: `Spent ${e.amount} rupees`, key: false };
    case "damage_taken":
      return { title: `Took ${hearts(e.quarters)} of damage`, key: false };
    case "healed":
      return { title: `Recovered ${hearts(e.quarters)}`, key: false };
    case "max_life_up":
      return { title: `Max hearts +${hearts(e.quarters)}`, key: true };
    case "died":
      return { title: "Link fell", key: true };
    case "age_changed":
      return { title: `Now ${e.age} Link`, key: true };
    case "scene":
      return { title: "Cutscene or item pickup", detail: `${Math.round(e.secs)} s`, key: false };
  }
}

/** Demo content shown while the game is not connected, so the design can be reviewed. */
export const DEMO_GAME: Game = {
  frame: 0,
  map: "KakarikoVillage_Adult",
  pos: [-40.9, 110, -17],
  age: "adult",
  life: 38,
  max_life: 56,
  rupees: 944,
  music: "BGM_Village",
  event: false,
  loading: false,
};

/** "KakarikoVillage_Adult_Alternative" -> "Kakariko Village". Placeholder until a real name table exists. */
export function friendlyMap(raw: string | null): string {
  if (!raw) return "Unknown area";
  const first = raw.split("_")[0];
  return first.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export const TILES: { id: string; title: string; desc: string; icon: string; dark?: boolean; locked?: string }[] = [
  { id: "map", title: "Map", desc: "Areas and what you've missed", icon: "GMap" },
  { id: "rumors", title: "Rumor Hunt", desc: "Hints for what's left", icon: "GRumor" },
  { id: "foes", title: "Hall of Foes", desc: "Enemies defeated and boss clears", icon: "GSkull", dark: true },
  { id: "today", title: "Today's Journal", desc: "Timeline and totals", icon: "GScroll" },
  { id: "journey", title: "My Journey", desc: "Medals and totals", icon: "GMedal", dark: true },
  { id: "compare", title: "Slot Compare", desc: "Your save slots side by side", icon: "GChart" },
  { id: "history", title: "History", desc: "Your days over time", icon: "GHistory", dark: true },
  {
    id: "photos",
    title: "Photo Album",
    desc: "Not available",
    icon: "GCamera",
    locked: "The Photo Album is not available in Ocarina Journal. The PC version of the game has no photo capture for it to use.",
  },
  { id: "tapestry", title: "Tapestry", desc: "Your story, woven", icon: "GTapestry", dark: true },
  {
    id: "amiibo",
    title: "amiibo",
    desc: "Not available",
    icon: "GAmiibo",
    locked: "amiibo is not available in Ocarina Journal. It needs a console's NFC reader, which a PC does not have.",
  },
  { id: "ocarina", title: "Ocarina", desc: "Play and record songs", icon: "GOcarina" },
  { id: "quiz", title: "Quiz", desc: "Test your memory", icon: "GQuiz" },
];
