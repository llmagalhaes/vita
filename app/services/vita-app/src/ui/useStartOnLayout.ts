import { useRef } from "react";

/**
 * Run a mount animation exactly once, from the view's first onLayout — the
 * point where the native view provably exists. Scheduling mount tweens from
 * useEffect raced view attachment on busy boots (Reanimated 4 / new arch):
 * the withTiming was dropped and bars/vessels/crests stayed at their initial
 * value (device-verified session 6). Value-CHANGE tweens can stay in effects;
 * only the first kick needs this.
 */
export function useStartOnLayout(start: () => void): () => void {
  const started = useRef(false);
  return () => {
    if (started.current) return;
    started.current = true;
    start();
  };
}
