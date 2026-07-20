/**
 * On-device speech recognition — behind an interface so the UI never depends on
 * a specific engine.
 *
 * REAL ENGINE (APP-069): `nativeRecognizer` wraps `expo-speech-recognition`
 * (a config-plugin module over Android's `SpeechRecognizer` / iOS
 * `SFSpeechRecognizer`). It runs only in a standalone/CNG build — NOT in plain
 * store Expo Go (the SDK-56 native-module constraint, ADR-0002/ADR-0003), so
 * Expo Go + jest still get `stubRecognizer` (every UI state reachable, no native
 * module needed for tests). Audio never leaves the device: only the final text
 * does, via the APP-011 parse flow (Claude accepts no audio — sound→text is done
 * on device, interpretation is /parse/text).
 */

import Constants, { ExecutionEnvironment } from "expo-constants";

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

/**
 * Honest absence — used only if the native engine can't load in a real build
 * (module missing / recognition service unavailable). The mic declines
 * gracefully and points to typing rather than pretend. Mirrors stubHealthReader
 * / the notifier stub. `holdStart` reads isAvailable()=false → the "voice isn't
 * available, type instead" state (APP-058).
 */
export function unavailableRecognizer(): SpeechRecognizer {
  return {
    isAvailable: () => false,
    requestPermission: async () => "unavailable",
    start: () => {},
    stop: () => {},
    abort: () => {},
  };
}

/**
 * Device recognition locale, e.g. "pt-BR". Hermes ships Intl on RN 0.85, which
 * resolves to the device locale — zero-dep (no expo-localization). Falls back to
 * en-US. Only a language hint for the recognizer.
 */
export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

/** Minimal shape of `expo-speech-recognition` we depend on (typed here so jest
 * needs no native module; the real module satisfies this at runtime). */
type EsrModule = {
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable(): boolean;
    requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
    start(opts: { lang: string; interimResults: boolean; continuous: boolean }): void;
    stop(): void;
    abort(): void;
    addListener(event: string, cb: (e: any) => void): { remove(): void };
  };
};

/**
 * Real on-device recognizer over `expo-speech-recognition` (APP-069). Bridges
 * the native event stream to our interface: `result` (partial → onPartial,
 * final → onFinal), `error` (→ onError, except user `aborted`), and `end` as a
 * safety-net so a no-final stop still resets calmly. No speech / recognizer error
 * / permission-denied all surface honestly (never a silent success). Audio stays
 * on device — we only ever forward the transcript text.
 */
export function nativeRecognizer(
  mod: EsrModule = require("expo-speech-recognition") as EsrModule,
): SpeechRecognizer {
  const esr = mod.ExpoSpeechRecognitionModule;
  let subs: Array<{ remove(): void }> = [];
  let handlers: RecognizerHandlers | null = null;
  let finalHandled = false;

  const detach = () => {
    for (const s of subs) s.remove();
    subs = [];
  };

  return {
    isAvailable() {
      try {
        return esr.isRecognitionAvailable();
      } catch {
        return false;
      }
    },
    async requestPermission() {
      try {
        const res = await esr.requestPermissionsAsync();
        return res.granted ? "granted" : "denied";
      } catch {
        return "unavailable";
      }
    },
    start(h) {
      handlers = h;
      finalHandled = false;
      detach();
      subs.push(
        esr.addListener("result", (e: { isFinal: boolean; results?: Array<{ transcript?: string }> }) => {
          const text = e.results?.[0]?.transcript ?? "";
          if (e.isFinal) {
            if (finalHandled) return;
            finalHandled = true;
            handlers?.onFinal(text);
            detach();
          } else if (text) {
            handlers?.onPartial(text);
          }
        }),
        esr.addListener("error", (e: { error?: string; message?: string }) => {
          if (e.error === "aborted") return; // user cancel, not a failure
          if (finalHandled) return;
          finalHandled = true;
          handlers?.onError(e.message || e.error || "speech error");
          detach();
        }),
        esr.addListener("end", () => {
          // Safety net: stop() with no final result → reset calmly (empty final).
          if (finalHandled) return;
          finalHandled = true;
          handlers?.onFinal("");
          detach();
        }),
      );
      try {
        esr.start({ lang: deviceLocale(), interimResults: true, continuous: false });
      } catch (err) {
        finalHandled = true;
        handlers?.onError(String(err));
        detach();
      }
    },
    stop() {
      try {
        esr.stop();
      } catch {
        // ignore; the end/error listener resolves the state machine
      }
    },
    abort() {
      finalHandled = true; // suppress any late final/error from a user cancel
      try {
        esr.abort();
      } catch {
        // ignore
      }
      detach();
      handlers = null;
    },
  };
}

/**
 * Default recognizer by runtime:
 * - Expo Go / jest (StoreClient) → the streaming demo stub, so the voice UI is
 *   walkable in the store client (no native module).
 * - Any real (standalone/CNG) build → `nativeRecognizer`. If the native module
 *   can't load or the device has no recognition service, fall back to
 *   `unavailableRecognizer` (the honest "type instead" state, APP-058). A fake
 *   can still be injected via setRecognizer in tests.
 */
function defaultRecognizer(): SpeechRecognizer {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return stubRecognizer();
  }
  try {
    return nativeRecognizer();
  } catch {
    return unavailableRecognizer();
  }
}

let active: SpeechRecognizer | null = null;

/** The recognizer the app uses. */
export function getRecognizer(): SpeechRecognizer {
  if (!active) active = defaultRecognizer();
  return active;
}

/** Swap the recognizer (real engine at wiring time; a fake in tests). */
export function setRecognizer(r: SpeechRecognizer): void {
  active = r;
}
