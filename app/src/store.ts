import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { progress, startProgress } from "./sharedProgress";

/** App-owned progress shared with paired screens; display and window preferences remain local. */
export function useShared<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const initial = useRef<T>(init);
  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    try {
      const raw = localStorage.getItem(`oj.${key}`);
      if (raw) initial.current = JSON.parse(raw) as T;
    } catch {
      /* use the initial value */
    }
  }
  useEffect(startProgress, []);
  const read = () => progress.read(key, initial.current);
  const value = useSyncExternalStore(progress.subscribe, read);
  return [value, (next) => progress.update(key, typeof next === "function" ? (next as (v: T) => T)(read()) : next)];
}

/** Small persisted state in the webview's localStorage (stays on this PC). */
export function useLocal<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const k = `oj.${key}`;
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage full: keep working in memory */
    }
  }, [k, v]);
  return [v, setV];
}
