import { useSyncExternalStore } from "react";

/** Tiny change signal: bump after any local log write so screens re-read SQLite. */
const listeners = new Set<() => void>();
let version = 0;

export function logChanged(): void {
  version++;
  listeners.forEach((l) => l());
}

/** Non-React subscriber (APP-110's settings push rides this). Returns an unsubscribe. */
export function onChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useLogVersion(): number {
  return useSyncExternalStore(onChange, () => version);
}
