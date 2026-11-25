import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

/** True in a plain browser (the second screen), false inside the app's own window. */
export const isRemote = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

/** A second screen has to be paired with the code the app shows. Called when the app says it isn't. */
const needPairing = new Set<() => void>();
export function onNeedPairing(fn: () => void): () => void {
  needPairing.add(fn);
  return () => needPairing.delete(fn);
}

/** Whether this page can reach the app on the PC. Only a second screen can lose it: the app was closed, or its second
 *  screen was switched off. While it is lost the page keeps asking, and loads again as soon as the app answers. */
export type Link = "up" | "down";
let link: Link = "up";
const linkListeners = new Set<(l: Link) => void>();
export function onLink(fn: (l: Link) => void): () => void {
  linkListeners.add(fn);
  fn(link);
  return () => linkListeners.delete(fn);
}
let retry: number | undefined;
function setLink(next: Link) {
  if (next === link) return;
  // Once disconnected, keep the overlay until a fresh page has loaded from the app. A late response to an old
  // image request must not reveal the stale page again or cancel reconnection.
  if (next === "up" && link === "down") return;
  link = next;
  linkListeners.forEach((f) => f(next));
  if (next === "down") retry = window.setInterval(() => void ping(), 2500);
}

let checking = false;
/** Check independently of the WebSocket: a phone can keep a dead socket open. Both checks and retries time out,
 * so a connection that never answers cannot leave the page showing stale data or pile up requests. */
async function ping() {
  if (checking) return;
  checking = true;
  const checkingRecovery = link === "down";
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), 4000);
  try {
    const res = await fetch("/api/invoke/get_state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
      cache: "no-store",
      signal: stop.signal,
    });
    // A valid state or a pairing response proves this is the app, not a cached page or an HTTP error.
    if (!res.ok && res.status !== 401) throw new Error("The app is not answering.");
    if (res.ok) await res.json();
    if (link === "down") {
      if (checkingRecovery) {
        window.clearInterval(retry);
        location.reload();
      }
    } else if (res.status === 401) {
      needPairing.forEach((f) => f());
    }
  } catch {
    setLink("down");
  } finally {
    window.clearTimeout(timer);
    checking = false;
  }
}
if (isRemote) {
  window.setInterval(() => {
    if (!document.hidden && link === "up") void ping();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void ping();
  });
  window.addEventListener("online", () => void ping());
  window.addEventListener("offline", () => setLink("down"));
}

/** Runs a command: through the app's own channel in its window, or over HTTP when this page is a second screen. Only
 *  read-only data commands and validated app-progress sync exist on the second-screen server. */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isRemote) return tauriInvoke<T>(cmd, args);
  let res: Response;
  try {
    res = await fetch(`/api/invoke/${cmd}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args ?? {}),
      credentials: "same-origin",
    });
  } catch (e) {
    // No answer at all: the app isn't there.
    setLink("down");
    throw e;
  }
  // A missing game file can also return 500. Check the state endpoint before treating a command error as offline.
  if (res.status >= 500) void ping();
  if (res.status === 401) {
    needPairing.forEach((f) => f());
    throw new Error("Pair this screen first.");
  }
  if (!res.ok) throw new Error((await res.text()) || `Command ${cmd} failed`);
  if ((res.headers.get("content-type") ?? "").includes("application/octet-stream")) return (await res.arrayBuffer()) as T;
  return (await res.json()) as T;
}

/** Listens for an event from the app. On the second screen only "live-state" exists: a socket that reconnects. */
export async function listen<T>(event: string, handler: (e: { payload: T }) => void): Promise<() => void> {
  if (!isRemote) return tauriListen<T>(event, handler);
  let socket: WebSocket | null = null;
  let stopped = false;
  let timer: number | undefined;
  const open = () => {
    if (stopped) return;
    socket = new WebSocket(`ws://${location.host}/ws`);
    socket.onmessage = (m) => {
      try {
        handler({ payload: JSON.parse(String(m.data)) as T });
      } catch {
        /* ignore a message that isn't state */
      }
    };
    socket.onclose = () => {
      if (stopped) return;
      // A refused socket looks the same as a lost one; asking for the state tells them apart (and asks to pair again).
      invoke("get_state").catch(() => {});
      timer = window.setTimeout(open, 2000);
    };
  };
  open();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    socket?.close();
  };
}

/** A second screen signs itself out: the app forgets this device, and it has to pair again to see anything. */
export async function signOut(): Promise<void> {
  const res = await fetch("/api/signout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error((await res.text()) || "Couldn't disconnect.");
}

/** The browser's own "install this page" offer, when it makes one (only on a secure page, so usually not on a home
 *  network's plain `http://` address). Settings falls back to written steps. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}
let installPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (isRemote) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    installListeners.forEach((f) => f());
  });
}
export function onInstallable(fn: () => void): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}
export const canInstall = () => installPrompt !== null;
export async function install(): Promise<void> {
  await installPrompt?.prompt();
  installPrompt = null;
  installListeners.forEach((f) => f());
}
/** Already opened from the home screen as an app. */
export const isInstalled = () =>
  isRemote && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
