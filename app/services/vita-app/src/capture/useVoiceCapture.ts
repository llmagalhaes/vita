import { useCallback, useRef, useState } from "react";
import { getRecognizer, type SpeechRecognizer } from "./speech";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "error"
  | "denied"
  | "unavailable";

/** Drag this far up while holding to arm cancel-on-release. */
export const CANCEL_THRESHOLD = 90;

/**
 * Hold-to-talk state machine over a {@link SpeechRecognizer}. The pill drives it
 * from a Pan gesture; the final transcript is handed to `onFinal` (which routes
 * it through the existing APP-011 parse→confirm flow — no parallel capture path).
 */
export function useVoiceCapture(
  onFinal: (transcript: string) => void,
  recognizer: SpeechRecognizer = getRecognizer(),
) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [willCancel, setWillCancel] = useState(false);
  const willCancelRef = useRef(false);
  const startedRef = useRef(false);

  const reset = useCallback(() => {
    startedRef.current = false;
    willCancelRef.current = false;
    setWillCancel(false);
    setTranscript("");
    setStatus("idle");
  }, []);

  const holdStart = useCallback(async () => {
    if (startedRef.current) return;
    if (!recognizer.isAvailable()) {
      setStatus("unavailable");
      return;
    }
    const perm = await recognizer.requestPermission();
    if (perm !== "granted") {
      setStatus(perm === "denied" ? "denied" : "unavailable");
      return;
    }
    startedRef.current = true;
    setTranscript("");
    setStatus("listening");
    recognizer.start({
      onPartial: (t) => setTranscript(t),
      onFinal: (t) => {
        setStatus("transcribing");
        const text = t.trim();
        // A real engine can deliver the final after stop(); commit here.
        if (!willCancelRef.current && text) onFinal(text);
        reset();
      },
      onError: () => {
        startedRef.current = false;
        setStatus("error");
      },
    });
  }, [recognizer, onFinal, reset]);

  /** translationY < 0 means dragging up (toward the cancel zone). */
  const holdMove = useCallback((translationY: number) => {
    if (!startedRef.current) return;
    const armed = translationY < -CANCEL_THRESHOLD;
    willCancelRef.current = armed;
    setWillCancel(armed);
  }, []);

  const holdEnd = useCallback(() => {
    if (!startedRef.current) return; // released before listening started
    if (willCancelRef.current) {
      recognizer.abort();
      reset();
    } else {
      setStatus("transcribing");
      recognizer.stop(); // final arrives via onFinal handler above
    }
  }, [recognizer, reset]);

  /** Dismiss a denied/unavailable/error message (or force-cancel). */
  const dismiss = useCallback(() => {
    if (startedRef.current) recognizer.abort();
    reset();
  }, [recognizer, reset]);

  return { status, transcript, willCancel, holdStart, holdMove, holdEnd, dismiss };
}
