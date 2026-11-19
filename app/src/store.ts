import { useEffect, useState } from "react";

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
