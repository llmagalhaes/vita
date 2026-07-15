/**
 * Offline-capture review sheet (CEO Round 12 #2). Captures parked offline are parsed
 * and auto-logged on reconnect (durability) but flagged `needsReview` — they skipped
 * the online confirm/adjust/discard sheet. Home's banner opens this stack sheet so the
 * user gets that affordance back: per entry, Keep / Adjust / Discard.
 *
 * Reuses the check-in stack UX (overlay + drag-to-dismiss + step-through-a-queue) and
 * the capture DraftCard for the entry summary — no new visual language.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, SlideInDown } from "react-native-reanimated";
import { useCapture } from "../capture/CaptureContext";
import { DraftCard } from "../capture/CaptureSheet";
import { clearReview, deleteEntry, entriesNeedingReview, type LocalEntry } from "../db/entries";
import { logChanged, useLogVersion } from "../db/notify";
import { Button, Card, SheetBackdrop, Text, colors, fonts, motion, spacing, useSheetDrag, useSheetPresence } from "../ui";

// ── Sheet open/close store (mirrors checkins): Home's banner opens the overlay
//    mounted once in the main layout. ─────────────────────────────────────────
let sheetOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const openReview = (): void => {
  sheetOpen = true;
  emit();
};
export const closeReview = (): void => {
  sheetOpen = false;
  emit();
};
export function useReviewSheetOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sheetOpen,
  );
}

export function ReviewSheet() {
  const { t } = useTranslation();
  const open = useReviewSheetOpen();
  const version = useLogVersion();
  const capture = useCapture();
  const [queue, setQueue] = useState<LocalEntry[]>([]);
  const [index, setIndex] = useState(0);

  // Snapshot the pending-review list when the sheet opens; step through it locally.
  useEffect(() => {
    if (open) {
      setQueue(entriesNeedingReview());
      setIndex(0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { dragGesture, sheetStyle } = useSheetDrag(closeReview);
  useSheetPresence(open); // hide the tab bar under the sheet (CEO #1)

  if (!open) return null;
  void version; // re-render on log changes

  const current = queue[index];

  const advance = () => {
    logChanged();
    if (index + 1 >= queue.length) closeReview();
    else setIndex((i) => i + 1);
  };
  const keep = (e: LocalEntry) => {
    clearReview(e.id);
    advance();
  };
  const discard = (e: LocalEntry) => {
    deleteEntry(e.id);
    advance();
  };
  const adjust = (e: LocalEntry) => {
    // Reopen capture prefilled with the source phrase, drop the stale auto-add
    // (mirrors the online adjust — the draft is redone, not kept alongside).
    deleteEntry(e.id);
    logChanged();
    closeReview();
    capture.promptAdjust(e.sourcePhrase ?? "");
  };

  return (
    <View style={{ position: "absolute", inset: 0, justifyContent: "center", paddingHorizontal: 24 }}>
      <SheetBackdrop onClose={closeReview} closeLabel={t("common.cancel")} />
      <GestureDetector gesture={dragGesture}>
        <Animated.View
          entering={SlideInDown.duration(motion.pop.durationMs).easing(Easing.bezier(...motion.pop.bezier).factory())}
          style={[{ maxWidth: 360, width: "100%", alignSelf: "center", gap: spacing.sm }, sheetStyle]}
        >
          <View style={{ width: 40, height: 4.5, borderRadius: 3, backgroundColor: "rgba(120,100,75,0.35)", alignSelf: "center", marginBottom: 4 }} />
          {current ? (
            <>
              <View style={{ gap: 2, paddingHorizontal: 4 }}>
                <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.accent}>
                  {t("review.eyebrow")}
                </Text>
                <Text variant="caption" color={colors.labelMuted}>
                  {t("review.caption")} · {t("review.idxLabel", { current: index + 1, total: queue.length })}
                </Text>
              </View>
              <DraftCard draft={current} />
              <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
                <View style={{ flex: 1 }}>
                  <Button label={t("common.adjust")} variant="ghost" onPress={() => adjust(current)} />
                </View>
                <View style={{ flex: 1.3 }}>
                  <Button label={t("review.keep")} onPress={() => keep(current)} />
                </View>
              </View>
              <Pressable accessibilityRole="button" onPress={() => discard(current)} style={{ alignSelf: "center", paddingVertical: 4 }}>
                <Text variant="caption" color={colors.labelMuted} style={{ textDecorationLine: "underline" }}>
                  {t("common.discard")}
                </Text>
              </Pressable>
            </>
          ) : (
            <Card style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 22 }} color="#5F7A61">
                  ✓
                </Text>
              </View>
              <Text variant="title" style={{ fontSize: 17 }}>
                {t("review.allDone")}
              </Text>
              <View style={{ marginTop: spacing.sm }}>
                <Button label={t("mealDetail.back")} variant="ghost" onPress={closeReview} />
              </View>
            </Card>
          )}
          {current ? (
            <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>
              {t("habits.swipeDown")}
            </Text>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
