/**
 * APP-097 — Overview · Habits (prototype lines 485–503).
 *
 * One row per habit scheduled today: ✓ or — , one tap, undo in the toast. Answered
 * rows collapse to a quiet `done` / `not today` chip. The footer is the whole
 * philosophy: "One tap a day — never a streak."
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { answerCheckin, answeredCheckins, dateKey, pendingCheckins } from "../../habits/checkins";
import type { Habit } from "../../db/habits";
import { deleteEntry } from "../../db/entries";
import { logChanged } from "../../db/notify";
import { PressScale, Text, colors, fonts, mixOklab, useAccent } from "../../ui";
import { showToast } from "../../ui/toast";
import { MicroLabel, cardSurface } from "./parts";

export type HabitRow = { habit: Habit; answer?: string };

/** Today's rows: pending first-class, answered kept visible with their chip. */
export function habitRows(habits: Habit[], today: Date): HabitRow[] {
  const answered = new Map(answeredCheckins(habits, today).map((a) => [a.habit.id, a.answer]));
  const pending = new Set(pendingCheckins(habits, today).map((h) => h.id));
  return habits
    .filter((h) => answered.has(h.id) || pending.has(h.id))
    .map((h) => ({ habit: h, ...(answered.has(h.id) ? { answer: answered.get(h.id)! } : {}) }));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "21:00 · daily" / "07:00 · Mon Wed Fri" (prototype `h.sub`). */
export const habitSub = (h: Habit): string => {
  const days = h.days.map((on, i) => (on ? WEEKDAYS[i] : null)).filter(Boolean) as string[];
  return `${h.time} · ${days.length === 7 ? "daily" : days.join(" ")}`;
};

function Check({ color }: { color: string }) {
  return (
    <Svg width={15} height={15}>
      <Path d="M2.8 8 l3.2 3.2 L12.2 4.4" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function HabitsCard({ habits, today = new Date() }: { habits: Habit[]; today?: Date }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const rows = habitRows(habits, today);
  if (rows.length === 0) return null;

  const answer = (habit: Habit, yes: boolean) => {
    answerCheckin(habit, yes ? "yes" : "not_quite", today);
    showToast(yes ? t("day.habits.doneToast", { name: habit.name }) : t("day.habits.notTodayToast"), {
      undo: () => {
        // The check-in is written under `${habitId}:${date}` — deleting it puts the
        // row back to unanswered and cancels/reverses whatever the outbox queued.
        deleteEntry(`${habit.id}:${dateKey(today)}`);
        logChanged();
      },
    });
  };

  return (
    <View style={{ ...cardSurface, paddingVertical: 15, paddingHorizontal: 16, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 6 }}>
        <MicroLabel>{t("day.habits.label")}</MicroLabel>
        <Text style={{ fontFamily: fonts.bold, fontSize: 10.5 }} color={colors.disabled}>
          {t("day.habits.count", { n: rows.length })}
        </Text>
      </View>

      {rows.map(({ habit, answer: a }) => (
        <View
          key={habit.id}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.borderFaint }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading} numberOfLines={1}>
              {habit.name}
            </Text>
            <Text style={{ fontSize: 11, marginTop: 1 }} color={colors.faint} numberOfLines={1}>
              {habitSub(habit)}
            </Text>
          </View>

          {a == null ? (
            <>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t("day.habits.yes", { name: habit.name })}
                onPress={() => answer(habit, true)}
                scale={0.9}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: mixOklab(accent, 12, colors.card), alignItems: "center", justifyContent: "center" }}
              >
                <Check color={accent} />
              </PressScale>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t("day.habits.no", { name: habit.name })}
                onPress={() => answer(habit, false)}
                scale={0.9}
                style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.borderControlStrong, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.faint}>
                  —
                </Text>
              </PressScale>
            </>
          ) : (
            <View
              style={{
                borderRadius: 11,
                paddingVertical: 5,
                paddingHorizontal: 10,
                backgroundColor: a === "yes" ? colors.green.bg : colors.sandChip,
              }}
            >
              <Text
                style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}
                color={a === "yes" ? colors.green.ink : colors.muted}
              >
                {a === "yes" ? t("day.habits.answeredDone") : t("day.habits.answeredNot")}
              </Text>
            </View>
          )}
        </View>
      ))}

      <Text style={{ fontSize: 10.5, paddingTop: 6 }} color={colors.faint}>
        {t("day.habits.footer")}
      </Text>
    </View>
  );
}
