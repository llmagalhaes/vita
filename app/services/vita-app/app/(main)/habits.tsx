import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button, Card, Text, colors, fonts, spacing } from "../../src/ui";
import {
  createHabit,
  deleteHabit,
  listHabits,
  updateHabit,
  type Habit,
  type HabitInput,
  type HabitKind,
} from "../../src/db/habits";
import { logChanged, useLogVersion } from "../../src/db/notify";
import { getCachedPlan } from "../../src/db/plan";
import {
  answeredCheckins,
  habitDots,
  pendingCheckins,
  type Dot,
} from "../../src/habits/checkins";
import { AnsweredChip, CheckinQuestion, useAnswerCheckin } from "../../src/habits/CheckinSheet";
import { ensureNotificationPermission, refreshNotifications } from "../../src/habits/notifier";

const EYEBROW = {
  fontFamily: fonts.extraBold,
  fontSize: 11.5,
  letterSpacing: 1.4,
  textTransform: "uppercase",
} as const;

const WEEKDAYS = [false, true, true, true, true, true, false]; // Mon–Fri (index 0 = Sun)
const EVERY_DAY = [true, true, true, true, true, true, true];

/** After any habit change: re-read screens and reschedule notifications. */
function afterHabitChange() {
  logChanged();
  void refreshNotifications();
}

function DayChips({ days, onToggle }: { days: boolean[]; onToggle: (i: number) => void }) {
  const { t } = useTranslation();
  const letters = t("habits.dayLetters", { returnObjects: true }) as string[];
  return (
    <View style={{ flexDirection: "row", gap: 5, justifyContent: "space-between" }}>
      {letters.map((d, i) => {
        const on = days[i];
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onToggle(i)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? colors.accent : "transparent",
              borderWidth: 1.5,
              borderColor: on ? colors.accent : "rgba(120,100,75,0.18)",
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={on ? colors.card : colors.muted}>
              {d}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function HabitForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const plan = useMemo(() => getCachedPlan(), []);
  const [kind, setKind] = useState<HabitKind>("plain");
  const [name, setName] = useState("");
  const [time, setTime] = useState("21:00");
  const [days, setDays] = useState<boolean[]>([...EVERY_DAY]);
  const [planMealName, setPlanMealName] = useState<string | undefined>();

  const canSave = name.trim().length > 0 && (kind === "plain" || !!planMealName);

  const save = () => {
    if (!canSave) return;
    const input: HabitInput = { name: name.trim(), time: time.trim(), days, enabled: true, kind, planMealName };
    createHabit(input);
    void ensureNotificationPermission();
    afterHabitChange();
    onDone();
  };

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Card style={{ gap: spacing.md }}>
        <Text style={EYEBROW} color={colors.labelMuted}>
          {t("habits.form.title")}
        </Text>

        {plan && plan.meals.length > 0 && (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["plain", "plan"] as HabitKind[]).map((k) => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setKind(k)}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 14,
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: on ? colors.accent : "rgba(120,100,75,0.16)",
                    backgroundColor: on ? colors.estimateBg : "transparent",
                  }}
                >
                  <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? colors.accent : colors.muted}>
                    {t(k === "plain" ? "habits.form.typePlain" : "habits.form.typePlan")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text variant="caption" color={colors.labelMuted} style={{ marginTop: -4, lineHeight: 16 }}>
          {t(kind === "plain" ? "habits.form.typePlainCaption" : "habits.form.typePlanCaption")}
        </Text>

        {kind === "plan" && (
          <View style={{ gap: 7 }}>
            <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.muted}>
              {t("habits.form.whichMeal")}
            </Text>
            {(plan?.meals ?? []).map((m) => {
              const on = planMealName === m.name;
              return (
                <Pressable
                  key={m.name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setPlanMealName(m.name);
                    if (!name.trim()) setName(m.name);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: on ? colors.accent : "rgba(120,100,75,0.14)",
                    backgroundColor: on ? colors.estimateBg : "transparent",
                  }}
                >
                  <Text variant="label" style={{ fontSize: 13.5 }}>
                    {m.name}
                  </Text>
                  {m.time ? (
                    <Text variant="caption" color={colors.labelMuted}>
                      {m.time}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("habits.form.namePlaceholder")}
          placeholderTextColor={colors.labelMuted}
          accessibilityLabel={t("habits.form.namePlaceholder")}
          style={{
            borderWidth: 1,
            borderColor: "rgba(120,100,75,0.16)",
            backgroundColor: colors.surface,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontFamily: fonts.semiBold,
            fontSize: 15,
            color: colors.ink,
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Text variant="caption" style={{ fontFamily: fonts.bold, width: 44 }} color={colors.muted}>
            {t("habits.form.timeLabel")}
          </Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="21:00"
            placeholderTextColor={colors.labelMuted}
            accessibilityLabel={t("habits.form.timeLabel")}
            style={{
              borderWidth: 1,
              borderColor: "rgba(120,100,75,0.16)",
              backgroundColor: colors.surface,
              borderRadius: 14,
              paddingVertical: 10,
              width: 84,
              textAlign: "center",
              fontFamily: fonts.semiBold,
              fontSize: 14,
              color: colors.ink,
            }}
          />
        </View>

        <DayChips days={days} onToggle={(i) => setDays((d) => d.map((v, j) => (j === i ? !v : v)))} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button label={t("common.cancel")} variant="ghost" onPress={onDone} />
          <View style={{ flex: 1 }} />
          <Button label={t("habits.form.save")} onPress={save} disabled={!canSave} />
        </View>
      </Card>
    </Animated.View>
  );
}

const dotColor = (d: Dot): string =>
  d === "yes" ? colors.accent : d === "no" ? "rgba(120,100,75,0.28)" : colors.track;

function HabitRow({ habit }: { habit: Habit }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const dots = useMemo(() => habitDots(habit, new Date()), [habit]);

  const toggle = () => {
    updateHabit(habit.id, { enabled: !habit.enabled });
    afterHabitChange();
  };
  const setDay = (i: number) => {
    updateHabit(habit.id, { days: habit.days.map((v, j) => (j === i ? !v : v)) });
    afterHabitChange();
  };
  const setTime = (time: string) => {
    updateHabit(habit.id, { time });
    afterHabitChange();
  };
  const remove = () => {
    deleteHabit(habit.id);
    afterHabitChange();
  };

  return (
    <Card style={{ gap: 11, opacity: habit.enabled ? 1 : 0.55 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Text variant="title" style={{ fontSize: 15 }} numberOfLines={1}>
              {habit.name}
            </Text>
            {habit.kind === "plan" && (
              <View style={{ backgroundColor: colors.estimateBg, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.7, textTransform: "uppercase" }} color={colors.estimateInk}>
                  {t("habits.linkedPlan")}
                </Text>
              </View>
            )}
          </View>
          <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>
            {habit.time}
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: habit.enabled }}
          onPress={toggle}
          style={{ width: 42, height: 25, borderRadius: 13, backgroundColor: habit.enabled ? colors.accent : colors.track, justifyContent: "center" }}
        >
          <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: colors.card, marginLeft: habit.enabled ? 20 : 3, ...cardShadow }} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={habit.name}
          onPress={() => setExpanded((e) => !e)}
          style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "rgba(120,100,75,0.14)", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.muted}>
            {expanded ? "▴" : "▾"}
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 6 }}>
        {dots.map((d, i) => (
          <View
            key={i}
            style={{
              width: 13,
              height: 13,
              borderRadius: 7,
              backgroundColor: d === "none" ? colors.track : dotColor(d),
              borderWidth: d === "none" ? 1 : 0,
              borderColor: "rgba(120,100,75,0.18)",
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="caption" style={{ fontSize: 10 }} color={colors.labelMuted}>
          {t("habits.twoWeeksAgo")}
        </Text>
        <Text variant="caption" style={{ fontSize: 10 }} color={colors.labelMuted}>
          {t("habits.todayShort")}
        </Text>
      </View>

      {expanded && (
        <View style={{ borderTopWidth: 1, borderTopColor: "rgba(120,100,75,0.14)", borderStyle: "dashed", paddingTop: 12, gap: 11 }}>
          <DayChips days={habit.days} onToggle={setDay} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <TextInput
              value={habit.time}
              onChangeText={setTime}
              accessibilityLabel={t("habits.form.timeLabel")}
              style={{
                borderWidth: 1,
                borderColor: "rgba(120,100,75,0.16)",
                backgroundColor: colors.surface,
                borderRadius: 14,
                paddingVertical: 10,
                width: 80,
                textAlign: "center",
                fontFamily: fonts.semiBold,
                fontSize: 14,
                color: colors.ink,
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={remove}
              style={{ backgroundColor: colors.estimateBg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 15 }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.accent}>
                {t("habits.remove")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </Card>
  );
}

const cardShadow = {
  shadowColor: "#3C2D1E",
  shadowOpacity: 0.25,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

export default function Habits() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  const answer = useAnswerCheckin();
  const [tab, setTab] = useState<"today" | "manage">("today");
  const [formOpen, setFormOpen] = useState(false);

  const habits = useMemo(() => listHabits(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date();
  const pending = useMemo(() => pendingCheckins(habits, today), [habits]); // eslint-disable-line react-hooks/exhaustive-deps
  const answered = useMemo(() => answeredCheckins(habits, today), [habits]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 150, gap: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("habits.back")}
          onPress={() => router.replace("/home")}
          style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 16 }} color={colors.ink}>
            ‹
          </Text>
        </Pressable>
        <Text style={EYEBROW} color={colors.labelMuted}>
          {t("habits.eyebrow")}
        </Text>
        {tab === "manage" && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setFormOpen((o) => !o)}
            style={{ marginLeft: "auto", backgroundColor: colors.estimateBg, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.accent}>
              {t("habits.newHabit")}
            </Text>
          </Pressable>
        )}
      </View>

      {/* tab switch */}
      <View style={{ flexDirection: "row", backgroundColor: "#F0EDE2", borderRadius: 18, padding: 3, gap: 2 }}>
        {(["today", "manage"] as const).map((tb) => {
          const on = tab === tb;
          return (
            <Pressable
              key={tb}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(tb)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 15, alignItems: "center", backgroundColor: on ? colors.card : "transparent" }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={on ? colors.ink : colors.muted}>
                {t(tb === "today" ? "habits.today" : "habits.manage")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "today" ? (
        <>
          {pending.map((h) => (
            <CheckinQuestion key={h.id} habit={h} onAnswer={(a) => answer(h, a)} />
          ))}
          {answered.map((a) => (
            <AnsweredChip key={a.habit.id} name={a.habit.name} answer={a.answer} at={a.at} />
          ))}
          {pending.length === 0 && answered.length === 0 && (
            <Text variant="body" color={colors.muted} style={{ paddingHorizontal: 4, paddingTop: 6 }}>
              {t("habits.noneToday")}
            </Text>
          )}
        </>
      ) : (
        <>
          {formOpen && <HabitForm onDone={() => setFormOpen(false)} />}
          <Text style={EYEBROW} color={colors.labelMuted}>
            {t("habits.yourHabits")}
          </Text>
          {habits.length === 0 ? (
            <Text variant="body" color={colors.muted} style={{ paddingHorizontal: 4 }}>
              {t("habits.noHabits")}
            </Text>
          ) : (
            habits.map((h) => <HabitRow key={h.id} habit={h} />)
          )}
        </>
      )}

      <Text variant="caption" style={{ textAlign: "center", paddingHorizontal: 20, paddingTop: 8 }} color={colors.labelMuted}>
        {t("habits.philosophy")}
      </Text>
    </ScrollView>
  );
}
