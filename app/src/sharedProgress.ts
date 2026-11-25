import { invoke, listen } from "./ipc";

export interface SharedProgress {
  revision: number;
  values: Record<string, unknown>;
}
type Change = { key: string; value: unknown; initialize: boolean };

/** One connection and ordered writes for all shared hooks. Patches contain only changed entries, never stale maps. */
export function createProgressStore(
  send: (change: Change) => Promise<SharedProgress>,
  save: (key: string, value: unknown) => void,
  retry: (fn: () => void) => void,
) {
  let revision = -1;
  let values: Record<string, unknown> = {};
  const listeners = new Set<() => void>();
  const locals = new Map<string, unknown>();
  const migrated = new Set<string>();
  const pending: Change[] = [];
  let sending = false;
  const merge = (old: unknown, patch: unknown) => {
    if (Array.isArray(patch)) return [...new Set([...(Array.isArray(old) ? old : []), ...patch])];
    return { ...(old as object), ...(patch as object) };
  };
  const notify = () => listeners.forEach((fn) => fn());
  function receive(state: SharedProgress) {
    if (state.revision < revision) return;
    revision = state.revision;
    const next = { ...state.values };
    for (const change of pending) next[change.key] = merge(next[change.key], change.value);
    for (const [key, local] of locals) {
      if (!migrated.has(key)) {
        migrated.add(key);
        pending.push({ key, value: local, initialize: true });
      }
    }
    for (const [key, value] of Object.entries(next)) {
      if (JSON.stringify(values[key]) === JSON.stringify(value)) next[key] = values[key];
      save(key, next[key]);
    }
    values = next;
    notify();
    void drain();
  }
  async function drain() {
    if (sending || revision < 0 || !pending.length) return;
    sending = true;
    let failed = false;
    try {
      const state = await send(pending[0]);
      pending.shift();
      receive(state);
    } catch {
      // Keep pending changes and the local copy until the desktop is reachable again.
      failed = true;
    } finally {
      sending = false;
    }
    if (pending.length && failed)
      retry(() => {
        void drain();
      });
    else if (pending.length) void drain();
  }
  return {
    receive,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    read<T>(key: string, initial: T): T {
      if (!locals.has(key)) {
        locals.set(key, initial);
        if (revision >= 0) {
          migrated.add(key);
          pending.push({ key, value: initial, initialize: true });
          void drain();
        }
      }
      return (values[key] ?? locals.get(key)) as T;
    },
    update<T>(key: string, next: T, initialize = false) {
      const old = values[key] ?? locals.get(key);
      const patch = Array.isArray(next)
        ? next
        : Object.fromEntries(
            Object.entries(next as object).filter(([id, v]) => JSON.stringify((old as Record<string, unknown> | undefined)?.[id]) !== JSON.stringify(v)),
          );
      if (!Array.isArray(patch) && !Object.keys(patch).length) return;
      values[key] = next;
      save(key, next);
      pending.push({ key, value: patch, initialize });
      notify();
      void drain();
    },
  };
}

export const progress = createProgressStore(
  (change) => invoke<SharedProgress>("sync_ui", change),
  (key, value) => {
    try {
      localStorage.setItem(`oj.${key}`, JSON.stringify(value));
    } catch {
      /* keep working in memory */
    }
  },
  (fn) => {
    window.setTimeout(fn, 1000);
  },
);
let started = false;
export function startProgress() {
  if (started) return;
  started = true;
  const receive = (state: { ui_state?: SharedProgress }) => {
    if (state.ui_state) progress.receive(state.ui_state);
  };
  void listen<{ ui_state?: SharedProgress }>("live-state", (e) => receive(e.payload));
  void invoke<{ ui_state?: SharedProgress }>("get_state")
    .then(receive)
    .catch(() => {});
}
