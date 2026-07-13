import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api, type NewEntry } from "../api";
import { addLocalEntry } from "../db/entries";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";

export type CaptureStatus = "idle" | "parsing" | "review" | "error";

type CaptureState = {
  status: CaptureStatus;
  phrase: string;
  drafts: NewEntry[];
  index: number;
};

type CaptureContextValue = CaptureState & {
  prefill: string;
  toast: string | null;
  submit: (text: string) => void;
  confirm: () => void;
  discard: () => void;
  adjust: () => void;
  close: () => void;
  clearPrefill: () => void;
  showToast: (msg: string) => void;
};

const idle: CaptureState = { status: "idle", phrase: "", drafts: [], index: 0 };

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<CaptureState>(idle);
  const [prefill, setPrefill] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const submit = useCallback((text: string) => {
    const phrase = text.trim();
    if (!phrase) return;
    setState({ status: "parsing", phrase, drafts: [], index: 0 });
    api
      .parseText({ text: phrase, capturedAt: new Date().toISOString() })
      .then((r) => setState({ status: "review", phrase, drafts: r.drafts, index: 0 }))
      .catch(() => setState({ status: "error", phrase, drafts: [], index: 0 }));
  }, []);

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

  const confirm = useCallback(() => {
    if (state.status !== "review") return;
    const draft = state.drafts[state.index]!;
    // Local write always succeeds instantly; sync drains in the background.
    addLocalEntry(draft);
    logChanged();
    void drainOutbox(api).then(({ synced }) => {
      if (synced > 0) logChanged();
    });
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

  return (
    <CaptureContext.Provider
      value={{ ...state, prefill, toast, submit, confirm, discard, adjust, close, clearPrefill, showToast }}
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
