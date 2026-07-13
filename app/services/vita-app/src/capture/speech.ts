/**
 * On-device speech recognition — behind an interface so the UI never depends on
 * a specific engine.
 *
 * WHY STUBBED (APP-012): real recognition (expo-speech-recognition@56) is a
 * native module + config plugin — it needs a custom dev-client build and does
 * NOT run in plain store Expo Go (the SDK-56 constraint, ADR-0002/ADR-0003).
 * So the shipped default is `stubRecognizer`: it makes every UI state reachable
 * in Expo Go and streams a demo phrase. The real engine drops in behind this
 * same interface once the dev build exists (APP-007). Audio never leaves the
 * device either way — only the final text does, via the APP-011 parse flow.
 */

export type PermissionStatus = "granted" | "denied" | "unavailable";

export type RecognizerHandlers = {
  onPartial: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError: (message: string) => void;
};

export interface SpeechRecognizer {
  /** Whether a recognition engine exists on this device/runtime at all. */
  isAvailable(): boolean;
  /** Ask for mic + speech permission (native shows the OS dialog once). */
  requestPermission(): Promise<PermissionStatus>;
  /** Begin capturing; partials stream in, one final on stop(). */
  start(handlers: RecognizerHandlers): void;
  /** Release-to-send: stop capture, expect a final transcript. */
  stop(): void;
  /** Cancel: stop and discard, no final. */
  abort(): void;
}

const DEMO_PHRASE = "Had a banana and a handful of peanuts around 4";
const WORD_MS = 320;

/**
 * Fake recognizer for Expo Go / tests: streams `phrase` word by word as
 * partials, emits the accumulated text as the final on stop().
 */
export function stubRecognizer(phrase: string = DEMO_PHRASE): SpeechRecognizer {
  const words = phrase.split(" ");
  let timer: ReturnType<typeof setInterval> | null = null;
  let i = 0;
  let current = "";
  let handlers: RecognizerHandlers | null = null;

  const clear = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  return {
    isAvailable: () => true,
    requestPermission: async () => "granted",
    start(h) {
      handlers = h;
      i = 0;
      current = "";
      clear();
      timer = setInterval(() => {
        if (i >= words.length) return; // keep "listening" until released
        current = current ? `${current} ${words[i]}` : words[i]!;
        i += 1;
        handlers?.onPartial(current);
      }, WORD_MS);
    },
    stop() {
      clear();
      // Defer so callers can observe a "transcribing" tick before the final.
      const text = current;
      setTimeout(() => handlers?.onFinal(text), 0);
    },
    abort() {
      clear();
      current = "";
      handlers = null;
    },
  };
}

let active: SpeechRecognizer = stubRecognizer();

/** The recognizer the app uses. */
export function getRecognizer(): SpeechRecognizer {
  return active;
}

/** Swap the recognizer (real engine at wiring time; a fake in tests). */
export function setRecognizer(r: SpeechRecognizer): void {
  active = r;
}
