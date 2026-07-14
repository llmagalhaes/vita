import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, type NewEntry } from "../api";
import { addLocalEntry, enqueueInterpretation } from "../db/entries";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";
import { persistForQueue } from "./photo";

export type CaptureStatus = "idle" | "parsing" | "review" | "error";

type CaptureState = {
  status: CaptureStatus;
  phrase: string;
  drafts: NewEntry[];
  index: number;
  // error status payload: which message, and whether "Try again" (text) vs "Type instead" (photo).
  errorKey: string;
  canRetry: boolean;
};

type CaptureContextValue = CaptureState & {
  prefill: string;
  toast: string | null;
  textEntryNonce: number;
  submit: (text: string) => void;
  submitPhoto: (image: { uri: string }, caption?: string) => void;
  updateDraft: (next: NewEntry) => void;
  confirm: () => void;
  discard: () => void;
  adjust: () => void;
  close: () => void;
  clearPrefill: () => void;
  showToast: (msg: string) => void;
  requestTextEntry: () => void;
  promptAdjust: (phrase: string) => void;
};

const idle: CaptureState = {
  status: "idle",
  phrase: "",
  drafts: [],
  index: 0,
  errorKey: "capture.parseError",
  canRetry: true,
};

/** ApiError status → user-facing error message key for the photo path. */
function photoErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) return "capture.photo.unrecognized";
    if (err.status === 413) return "capture.photo.tooLarge";
  }
  return "capture.photo.error";
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<CaptureState>(idle);
  const [prefill, setPrefill] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [textEntryNonce, setTextEntryNonce] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Offline (no network to reach /parse): park the raw capture; the reconnect drain
  // interprets it later so nothing is lost. A reached-but-failing server (ApiError)
  // still surfaces the error for the user to retry / type instead.
  const queueOffline = useCallback(
    (input: Parameters<typeof enqueueInterpretation>[0]) => {
      enqueueInterpretation(input);
      showToast(t("capture.offlineQueued"));
      setState(idle);
    },
    [showToast, t],
  );

  const submit = useCallback(
    (text: string) => {
      const phrase = text.trim();
      if (!phrase) return;
      const capturedAt = new Date().toISOString();
      setState({ ...idle, status: "parsing", phrase });
      api
        .parseText({ text: phrase, capturedAt })
        .then((r) => setState({ ...idle, status: "review", phrase, drafts: r.drafts }))
        .catch((err) => {
          if (err instanceof ApiError) {
            setState({ ...idle, status: "error", phrase, errorKey: "capture.parseError", canRetry: true });
          } else {
            queueOffline({ kind: "text", text: phrase, capturedAt });
          }
        });
    },
    [queueOffline],
  );

  const submitPhoto = useCallback(
    (image: { uri: string }, caption?: string) => {
      const capturedAt = new Date().toISOString();
      setState({ ...idle, status: "parsing", phrase: caption ?? "" });
      api
        .parsePhoto({ image, caption, capturedAt })
        .then((r) => setState({ ...idle, status: "review", phrase: caption ?? "", drafts: r.drafts }))
        .catch((err) => {
          if (err instanceof ApiError) {
            setState({ ...idle, status: "error", phrase: caption ?? "", errorKey: photoErrorKey(err), canRetry: false });
          } else {
            // Persist the JPEG off the volatile manipulator cache before parking, so the
            // reconnect drain can still read it hours later (audit 1.2).
            void persistForQueue(image.uri).then((uri) =>
              queueOffline({ kind: "photo", text: caption, imageUri: uri, capturedAt }),
            );
          }
        });
    },
    [queueOffline],
  );

  const advance = useCallback(
    (s: CaptureState, confirmed: boolean) => {
      if (confirmed) showToast(t("capture.addedToast"));
      if (s.index + 1 < s.drafts.length) {
        setState({ ...s, index: s.index + 1 });
      } else {
        setState(idle);
      }
    },
    [showToast, t],
  );

  const updateDraft = useCallback((next: NewEntry) => {
    setState((s) =>
      s.status === "review"
        ? { ...s, drafts: s.drafts.map((d, i) => (i === s.index ? next : d)) }
        : s,
    );
  }, []);

  const confirm = useCallback(() => {
    if (state.status !== "review") return;
    const draft = state.drafts[state.index]!;
    // Local write always succeeds instantly; sync drains in the background.
    addLocalEntry(draft);
    logChanged();
    void drainOutbox(api)
      .then(({ synced }) => {
        if (synced > 0) logChanged();
      })
      .catch(() => {});
    advance(state, true);
  }, [state, advance]);

  const discard = useCallback(() => {
    if (state.status !== "review") return;
    advance(state, false);
  }, [state, advance]);

  const adjust = useCallback(() => {
    setPrefill(state.phrase);
    setState(idle);
  }, [state.phrase]);

  const close = useCallback(() => setState(idle), []);
  const clearPrefill = useCallback(() => setPrefill(""), []);
  // Photo declined / parse failed → drop the sheet and open the text field.
  const requestTextEntry = useCallback(() => {
    setState(idle);
    setTextEntryNonce((n) => n + 1);
  }, []);
  // Adjust an offline-review entry: reopen capture prefilled with its source phrase
  // (mirrors the online adjust). The nonce guarantees the field opens even when the
  // phrase is empty (e.g. a photo capture with no caption).
  const promptAdjust = useCallback((phrase: string) => {
    setState(idle);
    setPrefill(phrase);
    setTextEntryNonce((n) => n + 1);
  }, []);

  return (
    <CaptureContext.Provider
      value={{
        ...state,
        prefill,
        toast,
        textEntryNonce,
        submit,
        submitPhoto,
        updateDraft,
        confirm,
        discard,
        adjust,
        close,
        clearPrefill,
        showToast,
        requestTextEntry,
        promptAdjust,
      }}
    >
      {children}
    </CaptureContext.Provider>
  );
}

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture outside CaptureProvider");
  return ctx;
}
