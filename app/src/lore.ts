import { invoke } from "./ipc";
import { useEffect, useState } from "react";

/** Game text from the player's own files (crates/oj-gamedata/src/lore.rs): place names, item and enemy descriptions. */
export interface Lore {
  places: Record<string, string>;
  items: [string, string][];
  enemies: [string, string][];
}

let lorePromise: Promise<Lore | null> | null = null;

export function loadLore() {
  lorePromise ??= invoke<Lore>("get_lore").catch(() => {
    lorePromise = null;
    return null;
  });
  return lorePromise;
}

export function useLore(): Lore | null {
  const [l, setL] = useState<Lore | null>(null);
  useEffect(() => {
    let live = true;
    loadLore().then((x) => live && setL(x));
    return () => {
      live = false;
    };
  }, []);
  return l;
}
