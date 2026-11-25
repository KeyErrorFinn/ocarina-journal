import { invoke, isRemote } from "./ipc";
import { useEffect } from "react";

/** How the app's own window behaves: kept above other windows, see-through, and with or without its title bar. */
export interface WindowMode {
  /** Stay on top of other windows. */
  pin: boolean;
  /** Let what is behind the window show through it. */
  seeThrough: boolean;
  /** How solid the window is while it is see-through (MIN_OPACITY to 1). */
  opacity: number;
  /** The title bar and border; hidden, a slim bar of our own takes their place. */
  frame: boolean;
}

export const WINDOW_DEFAULTS: WindowMode = { pin: false, seeThrough: false, opacity: 0.72, frame: true };
/** Never fully invisible: a window you can't see can't be switched back. */
export const MIN_OPACITY = 0.25;

/** Puts the settings into effect: the page's transparency (see styles.css) and the window's pin and frame. Outside
 *  the app (a plain browser) the window commands simply fail, which is ignored. */
export function useApplyWindowMode(m: WindowMode) {
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-see-through", m.seeThrough);
    root.style.setProperty("--see", String(Math.max(MIN_OPACITY, Math.min(1, m.opacity))));
  }, [m.seeThrough, m.opacity]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-frameless", !m.frame);
    if (!isRemote) invoke("set_frame", { visible: m.frame }).catch(() => {});
  }, [m.frame]);
  useEffect(() => {
    if (!isRemote) invoke("set_pinned", { on: m.pin }).catch(() => {});
  }, [m.pin]);
}
