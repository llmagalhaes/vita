import { useSyncExternalStore } from "react";

/** Tiny change signal: bump after any local log write so screens re-read SQLite. */
const listeners = new Set<() => void>();
let version = 0;

export function logChanged(): void {
  version++;
  listeners.forEach((l) => l());
}

export function useLogVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}
