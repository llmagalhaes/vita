/**
 * Vacation mode setup sheet (APP-030). Pick a date range, choose whether to keep
 * check-in reminders, and add a habit or two just for the trip (typed or spoken —
 * dual input). Starting the trip saves the config: ranges persist to the backend
 * (D1, replace-on-write), the accent flips to the sea tone, and notifications
 * reschedule through the single gate. Trip habits are ordinary local habits.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Card, SheetOverlay, Text, Toggle, colors, fonts, showToast } from "../ui";
import { createHabit, deleteHabit } from "../db/habits";
import { getVacation, saveVacation } from "../db/vacation";
import { getRecognizer } from "../capture/speech";

const SEA = colors.vacationAccent;

/** YYYY-MM-DD that is a real calendar date. */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // Parse as UTC so the toISOString round-trip is timezone-independent — parsing as local
  // (no "Z") shifts midnight into the previous UTC day in +offset zones (e.g. Amsterdam),
  // which made every valid date fail the round-trip and left "Start vacation" disabled.
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function VacationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const today = new Date();
  const weekOut = new Date(today);
  weekOut.setDate(today.getDate() + 7);

  const [from, setFrom] = useState(iso(today));
  const [to, setTo] = useState(iso(weekOut));
  const [keepCheckins, setKeepCheckins] = useState(getVacation().keepCheckins);
  const [tripHabits, setTripHabits] = useState<Array<{ id: string; name: string }>>([]);
  const [typed, setTyped] = useState("");

  const rangeValid = isValidDate(from) && isValidDate(to) && from <= to;

  const addTripHabit = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Trip habits are normal local habits (all days, enabled) — cleaned up on cancel.
    const h = createHabit({ name: trimmed, days: Array(7).fill(true), time: "09:00", enabled: true, kind: "plain" });
    setTripHabits((prev) => [...prev, { id: h.id, name: trimmed }]);
    setTyped("");
  };

  const removeTripHabit = (id: string) => {
    deleteHabit(id);
    setTripHabits((prev) => prev.filter((h) => h.id !== id));
  };

  // Dual input: the mic fills the field via the app recognizer; the user edits then adds.
  const onMic = () => {
    const rec = getRecognizer();
    rec.start({ onPartial: setTyped, onFinal: setTyped, onError: () => {} });
    setTimeout(() => rec.stop(), 400);
  };

  const start = () => {
    saveVacation({ ranges: [{ start: from, end: to }], keepCheckins, tripHabitIds: tripHabits.map((h) => h.id) });
    setTripHabits([]);
    onClose();
    showToast(t("toast.vacationOn"));
  };

  // Cancel: undo the trip habits we speculatively created this session.
  const cancel = () => {
    tripHabits.forEach((h) => deleteHabit(h.id));
    setTripHabits([]);
    onClose();
  };

  return (
    <SheetOverlay visible={visible} onClose={cancel} closeLabel={t("common.cancel")} lift>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: "#E3EEF0", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 18 }} color={SEA}>☀</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title" style={{ fontSize: 19 }}>{t("vacation.title")}</Text>
            <Text variant="caption" color={colors.muted}>{t("vacation.subtitle")}</Text>
          </View>
        </View>

        {/* date range */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.labelMuted}
            accessibilityLabel={t("vacation.from")}
            style={{ borderWidth: 1, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.card, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12, fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink, flex: 1, textAlign: "center" }}
          />
          <Text color={colors.labelMuted}>–</Text>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.labelMuted}
            accessibilityLabel={t("vacation.to")}
            style={{ borderWidth: 1, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.card, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12, fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink, flex: 1, textAlign: "center" }}
          />
        </View>

        {/* keep check-ins */}
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 14 }}>{t("vacation.keepCheckins")}</Text>
            <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>{t("vacation.keepCheckinsSub")}</Text>
          </View>
          <Toggle on={keepCheckins} onToggle={() => setKeepCheckins((v) => !v)} onColor={SEA} accessibilityLabel={t("vacation.keepCheckins")} />
        </Card>

        {/* trip habits */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.labelMuted}>
            {t("vacation.tripAddLabel")}
          </Text>
          {tripHabits.map((h) => (
            <View key={h.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderWidth: 1.5, borderColor: "rgba(62,143,163,0.3)", borderRadius: 16, padding: 11 }}>
              <Text variant="label" style={{ flex: 1, fontSize: 13 }}>{h.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t("vacation.removeTrip")} onPress={() => removeTripHabit(h.id)}>
                <Text color={colors.muted} style={{ fontSize: 16 }}>✕</Text>
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: "rgba(120,100,75,0.12)", borderRadius: 22, paddingLeft: 15, paddingRight: 5, paddingVertical: 5 }}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => addTripHabit(typed)}
              placeholder={t("vacation.tripPlaceholder")}
              placeholderTextColor={colors.labelMuted}
              accessibilityLabel={t("vacation.tripAddLabel")}
              style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={t("capture.voice.a11yHint")} onPress={onMic} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SEA, alignItems: "center", justifyContent: "center" }}>
              <Text color={colors.card} style={{ fontSize: 15 }}>🎙</Text>
            </Pressable>
            {typed.trim() !== "" && (
              <Pressable accessibilityRole="button" accessibilityLabel={t("vacation.addTrip")} onPress={() => addTripHabit(typed)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#E3EEF0", alignItems: "center", justifyContent: "center" }}>
                <Text color={SEA} style={{ fontFamily: fonts.bold, fontSize: 18 }}>+</Text>
              </Pressable>
            )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!rangeValid}
          onPress={start}
          style={{ height: 50, borderRadius: 25, backgroundColor: SEA, alignItems: "center", justifyContent: "center", opacity: rangeValid ? 1 : 0.5 }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color="#F3FAFB">{t("vacation.start")}</Text>
        </Pressable>
        {!rangeValid && (
          <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>{t("vacation.invalidRange")}</Text>
        )}
        <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>{t("vacation.startNote", { to })}</Text>
      </View>
    </SheetOverlay>
  );
}
