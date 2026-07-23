/**
 * 30-day workout history plumbing (APP-091) — captured workouts merged with
 * Health Connect sessions, newest first, plus the preview-sheet state a tapped
 * row opens. Extracted from `workout/[id].tsx` so the Workout hub reuses the
 * identical data path. HC sessions are display-only and NEVER touch the outbox
 * (ADR-0016); the stub returns [] on iOS / Expo Go.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { entriesInRange, type LocalEntry } from "../db/entries";
import { getHealthReader, type HcSession } from "../health/healthConnect";
import { exerciseTypeKey, mergeHistory, type HistoryRow } from "./history";

export function useWorkoutHistory(): {
  history: HistoryRow[];
  preview: LocalEntry | null;
  previewSrc: string | undefined;
  openRow: (row: HistoryRow) => void;
  closePreview: () => void;
} {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<LocalEntry | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(undefined);
  const [hcSessions, setHcSessions] = useState<HcSession[]>([]);

  const range = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return { start, end };
  }, []);

  const captured = useMemo(() => entriesInRange("workout", range.start, range.end), [range]);
  useEffect(() => {
    let alive = true;
    void getHealthReader()
      .readSessions(range.start, range.end)
      .then((s) => alive && setHcSessions(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [range]);

  const sessionTitle = (s: HcSession) => s.title ?? t(`health.exerciseType.${exerciseTypeKey(s.exerciseType)}`);
  const history = useMemo(() => mergeHistory(captured, hcSessions, sessionTitle), [captured, hcSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRow = (row: HistoryRow) => {
    if (row.source === "capture" && row.entry) {
      setPreviewSrc(undefined);
      setPreview(row.entry);
    } else if (row.session) {
      setPreviewSrc(t("workoutDetail.viaHealthConnect"));
      setPreview({
        id: row.key,
        type: "workout",
        occurredAt: row.date,
        inputMethod: "text",
        isEstimate: true,
        syncState: "synced",
        needsReview: false,
        detail: { title: row.title, durationMin: row.durationMin, muscles: [], exercises: [] },
      } as LocalEntry);
    }
  };

  return { history, preview, previewSrc, openRow, closePreview: () => setPreview(null) };
}
