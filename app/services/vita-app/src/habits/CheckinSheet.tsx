/**
 * Check-in stack sheet (APP-025). Opened from Home's "N waiting" banner; stacks
 * today's pending check-ins, advances as they're answered, drag-down to dismiss.
 * The same CheckinQuestion card is reused inline by the Habits → Today tab.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, Keyframe, SlideInDown } from "react-native-reanimated";
import { useCapture } from "../capture/CaptureContext";
import { Button, Card, SheetBackdrop, Text, colors, fonts, motion, spacing, useSheetDrag, useSheetPresence } from "../ui";
import type { Habit } from "../db/habits";
import { listHabits } from "../db/habits";
import { useLogVersion } from "../db/notify";
import { answerCheckin, closeCheckins, pendingCheckins, useCheckinSheetOpen, type Answer } from "./checkins";

/** Answer + route "Not quite" on a plan check-in into capture. */
export function useAnswerCheckin(): (habit: Habit, answer: Answer) => void {
  const capture = useCapture();
  return (habit, answer) => {
    answerCheckin(habit, answer);
    if (habit.kind === "plan" && answer === "not_quite") capture.requestTextEntry();
  };
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The yes/no question card for one habit — used in the sheet and the Today tab. */
export function CheckinQuestion({
  habit,
  onAnswer,
  idxLabel,
}: {
  habit: Habit;
  onAnswer: (answer: Answer) => void;
  idxLabel?: string;
}) {
  const { t } = useTranslation();
  const isPlan = habit.kind === "plan";
  return (
    <Card
      style={{
        gap: spacing.md,
        borderWidth: 1.5,
        borderColor: "rgba(196,112,78,0.35)",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.accent}>
          {isPlan ? t("habits.planDueAt", { time: habit.time }) : t("habits.dueAt", { time: habit.time })}
        </Text>
        {idxLabel ? (
          <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.labelMuted}>
            {idxLabel}
          </Text>
        ) : null}
      </View>
      <Text variant="title" style={{ fontSize: 18 }}>
        {habit.name}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
        <View style={{ flex: 1.25 }}>
          <Button label={isPlan ? t("habits.planYes") : t("habits.yes")} onPress={() => onAnswer("yes")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={isPlan ? t("habits.planNo") : t("habits.no")} variant="ghost" onPress={() => onAnswer("not_quite")} />
        </View>
      </View>
      {isPlan && (
        <Text variant="caption" style={{ lineHeight: 16 }} color={colors.labelMuted}>
          {t("habits.notePlanYes")}
        </Text>
      )}
    </Card>
  );
}

/** A logged/answered check-in, shown after the user responds. */
export function AnsweredChip({ name, answer, at }: { name: string; answer: string; at: string }) {
  const { t } = useTranslation();
  const yes = answer === "yes";
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: yes ? "#E7EDE1" : colors.track,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={yes ? "#5F7A61" : colors.muted}>
          {yes ? "✓" : "–"}
        </Text>
      </View>
      <Text variant="label" style={{ flex: 1, fontSize: 14 }}>
        {name} — {t("habits.logged")}
      </Text>
      <Text variant="caption" color={colors.muted}>
        {timeOf(at)}
      </Text>
    </Card>
  );
}

export function CheckinSheet() {
  const { t } = useTranslation();
  const open = useCheckinSheetOpen();
  const version = useLogVersion();
  const answer = useAnswerCheckin();
  const [queue, setQueue] = useState<Habit[]>([]);
  const [index, setIndex] = useState(0);

  // Snapshot the pending list when the sheet opens; step through it locally.
  useEffect(() => {
    if (open) {
      setQueue(pendingCheckins(listHabits(), new Date()));
      setIndex(0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { dragGesture, sheetStyle } = useSheetDrag(closeCheckins);
  useSheetPresence(open); // hide the tab bar under the sheet (CEO #1)

  if (!open) return null;
  void version; // re-render on log changes so a stale queue item isn't shown

  const current = queue[index];
  const remaining = queue.length - index - 1; // cards still behind the top one

  // Prototype deck motion: the next card slides in from the right with a slight
  // tilt (`vtNextA`); "All caught up" pops (`vtPop`). Fable B5.
  const nextCardIn = new Keyframe({
    0: { opacity: 0, transform: [{ translateX: 52 }, { rotate: "2deg" }] },
    100: { opacity: 1, transform: [{ translateX: 0 }, { rotate: "0deg" }] },
  }).duration(320);
  const popIn = new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.92 }] },
    100: { opacity: 1, transform: [{ scale: 1 }] },
  }).duration(motion.pop.durationMs);

  return (
    <View style={{ position: "absolute", inset: 0, justifyContent: "center", paddingHorizontal: 30 }}>
      <SheetBackdrop onClose={closeCheckins} closeLabel={t("common.cancel")} />
      <GestureDetector gesture={dragGesture}>
        <Animated.View
          entering={SlideInDown.duration(motion.pop.durationMs).easing(Easing.bezier(...motion.pop.bezier).factory())}
          style={[{ maxWidth: 340, width: "100%", alignSelf: "center", gap: spacing.sm }, sheetStyle]}
        >
          <View style={{ width: 40, height: 4.5, borderRadius: 3, backgroundColor: "rgba(120,100,75,0.35)", alignSelf: "center", marginBottom: 4 }} />
          {current ? (
            <>
              <View>
                {/* peeking deck — tinted strips for up to 2 queued cards behind the top one */}
                {remaining > 1 && (
                  <View style={{ position: "absolute", top: -14, left: 24, right: 24, height: 20, borderRadius: 14, backgroundColor: "rgba(255,253,247,0.45)" }} />
                )}
                {remaining > 0 && (
                  <View style={{ position: "absolute", top: -8, left: 12, right: 12, height: 24, borderRadius: 16, backgroundColor: "rgba(255,253,247,0.7)" }} />
                )}
                <Animated.View key={current.id} entering={index === 0 ? undefined : nextCardIn}>
                  <CheckinQuestion
                    habit={current}
                    idxLabel={t("habits.idxLabel", { current: index + 1, total: queue.length })}
                    onAnswer={(a) => {
                      answer(current, a);
                      if (index + 1 >= queue.length) closeCheckins();
                      else setIndex((i) => i + 1);
                    }}
                  />
                </Animated.View>
              </View>
              <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>
                {t("habits.swipeDown")}
              </Text>
            </>
          ) : (
            <Animated.View entering={popIn}>
            <Card style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 22 }} color="#5F7A61">
                  ✓
                </Text>
              </View>
              <Text variant="title" style={{ fontSize: 17 }}>
                {t("habits.allCaughtUp")}
              </Text>
              <Text variant="caption" color={colors.muted}>
                {t("habits.nothingWaiting")}
              </Text>
              <View style={{ marginTop: spacing.sm }}>
                <Button label={t("mealDetail.back")} variant="ghost" onPress={closeCheckins} />
              </View>
            </Card>
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
