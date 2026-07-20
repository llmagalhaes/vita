import { nativeRecognizer, type RecognizerHandlers } from "../speech";

/** Fake `expo-speech-recognition` module: captures listeners so a test can emit
 * native events without the real native module (jest never loads it). */
function fakeEsr(opts: { available?: boolean; granted?: boolean } = {}) {
  const listeners: Record<string, (e: any) => void> = {};
  const calls = { started: false, stopped: false, aborted: false };
  const removed: string[] = [];
  const mod = {
    ExpoSpeechRecognitionModule: {
      isRecognitionAvailable: () => opts.available ?? true,
      requestPermissionsAsync: async () => ({ granted: opts.granted ?? true }),
      start: () => {
        calls.started = true;
      },
      stop: () => {
        calls.stopped = true;
      },
      abort: () => {
        calls.aborted = true;
      },
      addListener: (event: string, cb: (e: any) => void) => {
        listeners[event] = cb;
        return { remove: () => removed.push(event) };
      },
    },
  };
  return {
    mod,
    calls,
    removed,
    emit: (event: string, e: any) => listeners[event]?.(e),
  };
}

function handlers() {
  const partials: string[] = [];
  const finals: string[] = [];
  const errors: string[] = [];
  const h: RecognizerHandlers = {
    onPartial: (t) => partials.push(t),
    onFinal: (t) => finals.push(t),
    onError: (m) => errors.push(m),
  };
  return { h, partials, finals, errors };
}

describe("nativeRecognizer event mapping", () => {
  test("partial → onPartial, final → onFinal once, then detaches", () => {
    const esr = fakeEsr();
    const rec = nativeRecognizer(esr.mod);
    const { h, partials, finals } = handlers();
    rec.start(h);
    expect(esr.calls.started).toBe(true);

    esr.emit("result", { isFinal: false, results: [{ transcript: "comi um" }] });
    esr.emit("result", { isFinal: false, results: [{ transcript: "comi um pão" }] });
    esr.emit("result", { isFinal: true, results: [{ transcript: "comi um pão de queijo" }] });
    // A late duplicate final must be ignored.
    esr.emit("result", { isFinal: true, results: [{ transcript: "spurious" }] });

    expect(partials).toEqual(["comi um", "comi um pão"]);
    expect(finals).toEqual(["comi um pão de queijo"]);
    expect(esr.removed).toEqual(["result", "error", "end"]); // listeners cleaned up
  });

  test("recognizer error surfaces to onError (honest, not silent)", () => {
    const esr = fakeEsr();
    const rec = nativeRecognizer(esr.mod);
    const { h, errors } = handlers();
    rec.start(h);
    esr.emit("error", { error: "no-speech", message: "No speech" });
    expect(errors).toEqual(["No speech"]);
  });

  test("user abort suppresses a late error/final", () => {
    const esr = fakeEsr();
    const rec = nativeRecognizer(esr.mod);
    const { h, errors, finals } = handlers();
    rec.start(h);
    rec.abort();
    expect(esr.calls.aborted).toBe(true);
    esr.emit("error", { error: "aborted", message: "Aborted" });
    esr.emit("result", { isFinal: true, results: [{ transcript: "late" }] });
    expect(errors).toEqual([]);
    expect(finals).toEqual([]);
  });

  test("end with no final resets calmly with empty final", () => {
    const esr = fakeEsr();
    const rec = nativeRecognizer(esr.mod);
    const { h, finals } = handlers();
    rec.start(h);
    esr.emit("end", null);
    expect(finals).toEqual([""]);
  });

  test("permission denied maps to denied; not-granted never fabricates", async () => {
    const esr = fakeEsr({ granted: false });
    const rec = nativeRecognizer(esr.mod);
    expect(await rec.requestPermission()).toBe("denied");
  });
});
