import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

/** Game text from the player's own files (crates/oj-gamedata/src/lore.rs): place names, item and enemy descriptions. */
export interface Lore {
  places: Record<string, string>;
  items: [string, string][];
  enemies: [string, string][];
}

let lorePromise: Promise<Lore | null> | null = null;

export function useLore(): Lore | null {
  const [l, setL] = useState<Lore | null>(null);
  useEffect(() => {
    lorePromise ??= invoke<Lore>("get_lore").catch(() => {
      lorePromise = null;
      return null;
    });
    let live = true;
    lorePromise.then((x) => live && setL(x));
    return () => {
      live = false;
    };
  }, []);
  return l;
}
