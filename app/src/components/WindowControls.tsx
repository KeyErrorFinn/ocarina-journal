import { invoke } from "@tauri-apps/api/core";
import { MIN_OPACITY, type WindowMode } from "../windowMode";
import { Toggle } from "./chrome";

type Props = { mode: WindowMode; set: (m: WindowMode) => void };

const slider = (mode: WindowMode, set: Props["set"], label: string) => (
  <input
    type="range"
    className="opacity-range"
    aria-label={label}
    min={Math.round(MIN_OPACITY * 100)}
    max={100}
    value={Math.round(mode.opacity * 100)}
    onChange={(e) => set({ ...mode, opacity: Number(e.target.value) / 100 })}
  />
);

/** The window settings, in the Home menu. */
export function WindowPanel({ mode, set }: Props) {
  return (
    <div className="winpanel">
      <h3>Window</h3>
      <div className="setting">
        <span>
          Keep on top of other windows
          <small>So other apps can't cover it while you play.</small>
        </span>
        <Toggle on={mode.pin} label="keep on top of other windows" onChange={(v) => set({ ...mode, pin: v })} />
      </div>
      <div className="setting">
        <span>
          See-through mode
          <small>Lets what is behind the window show through, to overlay it on a game.</small>
        </span>
        <Toggle on={mode.seeThrough} label="see-through mode" onChange={(v) => set({ ...mode, seeThrough: v })} />
      </div>
      {mode.seeThrough && (
        <div className="setting">
          <span>How solid it is</span>
          {slider(mode, set, "How solid the window is")}
        </div>
      )}
      <div className="setting">
        <span>
          Hide the title bar
          <small>A slim bar with these controls replaces it. Drag that bar to move the window.</small>
        </span>
        <Toggle on={!mode.frame} label="hide the title bar" onChange={(v) => set({ ...mode, frame: !v })} />
      </div>
    </div>
  );
}

/** Shown while the title bar is hidden: something to drag the window by, and the controls that would otherwise be out
 *  of reach (pin, see-through, how solid, bringing the title bar back, closing). */
export function OverlayBar({ mode, set }: Props) {
  return (
    <div className="overlay-bar" role="toolbar" aria-label="Window controls">
      <div className="grip" onPointerDown={(e) => e.button === 0 && invoke("drag_window").catch(() => {})} title="Drag to move the window" />
      <button
        aria-pressed={mode.pin}
        className={mode.pin ? "on" : ""}
        title="Keep on top of other windows"
        aria-label="Keep on top"
        onClick={() => set({ ...mode, pin: !mode.pin })}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 3h6l-1 6 3.5 3.5H6.5L10 9z M12 12.5V21" />
        </svg>
      </button>
      <button
        aria-pressed={mode.seeThrough}
        className={mode.seeThrough ? "on" : ""}
        title="See-through mode"
        aria-label="See-through mode"
        onClick={() => set({ ...mode, seeThrough: !mode.seeThrough })}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      </button>
      {mode.seeThrough && slider(mode, set, "How solid the window is")}
      <button title="Show the title bar" aria-label="Show the title bar" onClick={() => set({ ...mode, frame: true })}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 5h16v14H4z M4 9h16" />
        </svg>
      </button>
      <button title="Close Ocarina Journal" aria-label="Close" onClick={() => invoke("quit_app").catch(() => {})}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
