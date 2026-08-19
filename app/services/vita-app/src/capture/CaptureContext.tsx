import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, type NewEntry } from "../api";
import { dayKey } from "../day/record";
import { addLocalEntry, deleteEntry, enqueueInterpretation } from "../db/entries";
import { getDayRecord, getOverlay, recordMeals } from "../db/dayRecord";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";
import { getCachedPlan } from "../db/plan";
import { showToast } from "../ui/toast";
import { applyDelta, planDelta, revertDelta, type PlanDelta } from "./delta";
import { persistForQueue } from "./photo";

/** "text" = the sheet's `Tell Vita what happened` field (prototype `capTextOn`). */
export type CaptureStatus = "idle" | "text" | "parsing" | "review" | "error";

type CaptureState = {
  status: CaptureStatus;
  phrase: string;
  drafts: NewEntry[];
  /** Parallel to `drafts`: the plan delta for that draft, or null → v3 loose card. */
  deltas: (PlanDelta | null)[];
  index: number;
  // error status payload: which message, and whether "Try again" (text) vs "Type instead" (photo).
  errorKey: string;
  canRetry: boolean;
};

type CaptureContextValue = CaptureState & {
  prefill: string;
  delta: PlanDelta | null;
  submit: (text: string) => void;
  submitPhoto: (image: { uri: string }, caption?: string) => void;
  updateDraft: (next: NewEntry) => void;
  confirm: () => void;
  discard: () => void;
  adjust: () => void;
  close: () => void;
  showToast: (msg: string) => void;
  /** Open the sheet's text field (Aa button, photo decline, parse failure). */
  requestTextEntry: (prefill?: string) => void;
  promptAdjust: (phrase: string) => void;
};

const idle: CaptureState = {
  status: "idle",
  phrase: "",
  drafts: [],
  deltas: [],
  index: 0,
  errorKey: "capture.parseError",
  canRetry: true,
};

/**
 * APP-104 — "open this meal" signal for the Day timeline (APP-098). Recording a
 * delta auto-expands the meal it touched, so the user lands on what just changed.
 * ponytail: a 10-line module store, same shape as `ui/toast` — no context to thread,
 * and the timeline reads it with one hook.
 */
let focused: string | null = null;
const focusListeners = new Set<() => void>();
export function signalExpandMeal(planMealId: string | null): void {
  focused = planMealId;
  focusListeners.forEach((l) => l());
}
export const getExpandedMeal = (): string | null => focused;
export function useExpandedMeal(): string | null {
  return useSyncExternalStore(
    (cb) => {
      focusListeners.add(cb);
      return () => focusListeners.delete(cb);
    },
    getExpandedMeal,
    getExpandedMeal,
  );
}

/** ApiError status → user-facing error message key for the photo path. */
function photoErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) return "capture.photo.unrecognized";
    if (err.status === 413) return "capture.photo.tooLarge";
  }
  return "capture.photo.error";
}

/**
 * PLAN R6: the parse hands back the matched meal's FULL composition — the delta is
 * computed here, app-side, against the plan + today's overlay. A draft that matches
 * nothing (off-plan meal, water, workout, stale pointer) yields null and keeps the
 * v3 loose-draft card, so an off-plan meal is still recordable.
 */
function deltasFor(drafts: NewEntry[]): (PlanDelta | null)[] {
  const meals = getCachedPlan()?.meals ?? [];
  if (meals.length === 0) return drafts.map(() => null);
  const overlay = getOverlay();
  return drafts.map((d) => planDelta(d, meals, overlay));
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<CaptureState>(idle);
  const [prefill, setPrefill] = useState("");

  // Offline (no network to reach /parse): park the raw capture; the reconnect drain
  // interprets it later so nothing is lost. A reached-but-failing server (ApiError)
  // still surfaces the error for the user to retry / type instead.
  const queueOffline = useCallback(
    (input: Parameters<typeof enqueueInterpretation>[0]) => {
      enqueueInterpretation(input);
      showToast(t("capture.offlineQueued"));
      setState(idle);
    },
    [t],
  );

  const reviewed = useCallback(
    (phrase: string, drafts: NewEntry[]) =>
      setState({ ...idle, status: "review", phrase, drafts, deltas: deltasFor(drafts) }),
    [],
  );

  const submit = useCallback(
    (text: string) => {
      const phrase = text.trim();
      if (!phrase) return;
      const capturedAt = new Date().toISOString();
      setState({ ...idle, status: "parsing", phrase });
      api
        .parseText({ text: phrase, capturedAt })
        .then((r) => reviewed(phrase, r.drafts))
        .catch((err) => {
          if (err instanceof ApiError) {
            setState({ ...idle, status: "error", phrase, errorKey: "capture.parseError", canRetry: true });
          } else {
            queueOffline({ kind: "text", text: phrase, capturedAt });
          }
        });
    },
    [queueOffline, reviewed],
  );

  const submitPhoto = useCallback(
    (image: { uri: string }, caption?: string) => {
      const capturedAt = new Date().toISOString();
      setState({ ...idle, status: "parsing", phrase: caption ?? "" });
      api
        .parsePhoto({ image, caption, capturedAt })
        .then((r) => reviewed(caption ?? "", r.drafts))
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
    [queueOffline, reviewed],
  );

  const advance = useCallback((s: CaptureState) => {
    if (s.index + 1 < s.drafts.length) setState({ ...s, index: s.index + 1 });
    else setState(idle);
  }, []);

  const updateDraft = useCallback((next: NewEntry) => {
    setState((s) =>
      s.status === "review"
        ? { ...s, drafts: s.drafts.map((d, i) => (i === s.index ? next : d)) }
        : s,
    );
  }, []);

  const drain = useCallback(() => {
    void drainOutbox(api)
      .then(({ synced }) => {
        if (synced > 0) logChanged();
      })
      .catch(() => {});
  }, []);

  /**
   * `Record it` — the delta lands on the DAY RECORD (one idempotent entry per plan
   * meal per day), the touched meal auto-expands, and the toast's Undo restores the
   * previous item *and* the previous meal state (or removes the record entirely when
   * the meal was unrecorded before).
   */
  const recordDelta = useCallback(
    (delta: PlanDelta, draft: NewEntry, phrase: string) => {
      const date = dayKey(new Date(draft.occurredAt));
      const { record, undo } = applyDelta(getDayRecord(date), delta, draft.occurredAt);
      recordMeals([record], phrase || undefined);
      signalExpandMeal(delta.planMealId);
      showToast(t("capture.delta.toast", { meal: delta.title }), {
        undo: () => {
          const back = revertDelta(getDayRecord(date), undo);
          if (back.restore) recordMeals([back.restore]);
          else if (back.remove) {
            deleteEntry(back.remove);
            logChanged();
            drain();
          }
          signalExpandMeal(delta.planMealId);
        },
      });
    },
    [drain, t],
  );

  const confirm = useCallback(() => {
    if (state.status !== "review") return;
    const draft = state.drafts[state.index]!;
    const delta = state.deltas[state.index] ?? null;
    if (delta) {
      recordDelta(delta, draft, state.phrase);
    } else {
      // Off-plan / water / workout: the v3 path — local write, background drain.
      addLocalEntry(draft);
      logChanged();
      drain();
      showToast(t("capture.addedToast"));
    }
    advance(state);
  }, [state, advance, drain, recordDelta, t]);

  const discard = useCallback(() => {
    if (state.status !== "review") return;
    advance(state);
  }, [state, advance]);

  const close = useCallback(() => setState(idle), []);

  // Reopen the text field, optionally carrying a phrase back into it (Adjust, or an
  // offline-review entry). The prototype's text capture lives in the sheet, so this
  // is one state change — no pill-side unfolding any more.
  const requestTextEntry = useCallback((text = "") => {
    setPrefill(text);
    setState({ ...idle, status: "text", phrase: text });
  }, []);

  const adjust = useCallback(() => requestTextEntry(state.phrase), [requestTextEntry, state.phrase]);
  const promptAdjust = useCallback((phrase: string) => requestTextEntry(phrase), [requestTextEntry]);

  const value = useMemo<CaptureContextValue>(
    () => ({
      ...state,
      prefill,
      delta: state.deltas[state.index] ?? null,
      submit,
      submitPhoto,
      updateDraft,
      confirm,
      discard,
      adjust,
      close,
      showToast,
      requestTextEntry,
      promptAdjust,
    }),
    [state, prefill, submit, submitPhoto, updateDraft, confirm, discard, adjust, close, requestTextEntry, promptAdjust],
  );

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture outside CaptureProvider");
  return ctx;
}
