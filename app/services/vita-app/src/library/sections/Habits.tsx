/**
 * "Habits" (APP-103, prototype lines 792–822). A habit is a name, a time and a set
 * of weekdays — Vita never suggests one. The row switch IS the notification (the
 * habit itself stays either way), and removing one is undoable: the toast says
 * "history stays" because the check-in entries it produced are never touched.
 *
 * Weekday circles run Mon-first like the prototype; storage stays Sunday-first
 * (`Habit.days[0] = Sunday`, matching `Date.getDay()`), so the order is a view
 * concern only.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { Text, Toggle, colors, fonts, radii, shadowCard, showToast, useAccent } from "../../ui";
import { createHabit, deleteHabit, listHabits, restoreHabit, updateHabit, type Habit } from "../../db/habits";
import { logChanged, useLogVersion } from "../../db/notify";
import { ensureNotificationPermission, refreshNotifications } from "../../notify/notifier";
import { CardNote, FormInput, ListCard, ListRow, PillButton, SectionLabel, tinted } from "../parts";

/** Display order Mon→Sun over Sunday-first storage. */
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const EVERY_DAY = () => [true, true, true, true, true, true, true];

/** After any habit change: re-read screens and reschedule notifications. */
function afterChange() {
  logChanged();
  void refreshNotifications();
}

function daysLabel(h: Habit, letters: string[], allLabel: string): string {
  if (h.days.every(Boolean)) return allLabel;
  return MON_FIRST.filter((d) => h.days[d]).map((d) => letters[d]).join(" · ");
}

function AddForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const letters = t("library.habits.dayLetters", { returnObjects: true }) as string[];
  const [name, setName] = useState("");
  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState<boolean[]>(EVERY_DAY);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createHabit({ name: trimmed, days, time: time.trim() || "08:00", enabled: true });
    void ensureNotificationPermission();
    afterChange();
    onDone();
    showToast(t("library.habits.addedToast", { name: trimmed }));
  };

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{
        backgroundColor: colors.card,
        borderRadius: radii.card,
        padding: 16,
        borderWidth: 1.5,
        borderColor: colors.border,
        gap: 11,
        ...shadowCard,
      }}
    >
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.labelMuted}>
        {t("library.habits.formTitle")}
      </Text>
      <FormInput value={name} onChangeText={setName} placeholder={t("library.habits.namePlaceholder")} label={t("library.habits.nameLabel")} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FormInput value={time} onChangeText={setTime} label={t("library.habits.timeLabel")} width={78} center />
        <Text style={{ fontSize: 11, lineHeight: 16, flex: 1 }} color={colors.labelMuted}>{t("library.habits.timeHint")}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 5, justifyContent: "space-between" }}>
        {MON_FIRST.map((d) => {
          const on = days[d];
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={letters[d]}
              onPress={() => setDays((prev) => prev.map((v, i) => (i === d ? !v : v)))}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: on ? accent : "rgba(120,100,75,0.3)",
                backgroundColor: on ? tinted(accent) : "transparent",
              }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={on ? accent : colors.muted}>{letters[d]}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PillButton label={t("common.cancel")} onPress={onDone} height={42} flex={1} />
        <PillButton label={t("library.habits.save")} onPress={save} tone="accent" accent={accent} height={42} flex={1.2} disabled={name.trim() === ""} />
      </View>
    </Animated.View>
  );
}

export function Habits() {
  const { t } = useTranslation();
  const accent = useAccent();
  const version = useLogVersion();
  void version;
  const habits = listHabits();
  const letters = t("library.habits.dayLetters", { returnObjects: true }) as string[];
  const [formOpen, setFormOpen] = useState(false);

  const toggleNotif = (h: Habit) => {
    updateHabit(h.id, { enabled: !h.enabled });
    afterChange();
    showToast(h.enabled ? t("library.habits.notifOff") : t("library.habits.notifOn", { time: h.time }));
  };

  // Remove is undoable and never touches the check-ins the habit produced.
  const remove = (h: Habit) => {
    deleteHabit(h.id);
    afterChange();
    showToast(t("library.habits.removedToast", { name: h.name }), {
      undo: () => {
        restoreHabit(h);
        afterChange();
      },
    });
  };

  return (
    <>
      <SectionLabel
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => setFormOpen((o) => !o)}
            style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 15, backgroundColor: tinted(accent) }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={accent}>{t("library.habits.new")}</Text>
          </Pressable>
        }
      >
        {t("library.habits.title")}
      </SectionLabel>

      {formOpen ? <AddForm onDone={() => setFormOpen(false)} /> : null}

      <ListCard>
        {habits.map((h) => (
          <ListRow key={h.id} style={{ gap: 10, opacity: h.enabled ? 1 : 0.45 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading}>{h.name}</Text>
              <Text style={{ fontSize: 11, marginTop: 1 }} color={colors.muted}>
                {h.time} · {daysLabel(h, letters, t("library.habits.daily"))}
              </Text>
            </View>
            <Toggle
              on={h.enabled}
              onToggle={() => toggleNotif(h)}
              onColor={colors.green.fill}
              offColor={colors.sandLight}
              size="sm"
              accessibilityLabel={t("library.habits.notifLabel", { name: h.name })}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("library.habits.removeLabel", { name: h.name })}
              onPress={() => remove(h)}
              hitSlop={6}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.borderControl,
                backgroundColor: colors.canvas,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 14 }} color={colors.faint}>×</Text>
            </Pressable>
          </ListRow>
        ))}
        {habits.length === 0 ? (
          <Text style={{ fontSize: 12.5, paddingVertical: 11, lineHeight: 19 }} color={colors.muted}>
            {t("library.habits.none")}
          </Text>
        ) : null}
        <CardNote>{t("library.habits.note")}</CardNote>
      </ListCard>
    </>
  );
}
