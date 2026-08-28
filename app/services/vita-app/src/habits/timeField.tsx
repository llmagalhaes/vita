/**
 * R18-D — the habit reminder time, picked the way the OS picks times.
 *
 * It used to be a free-text box: the CEO had to type the colon ("preciso digitar
 * até os dois pontos"). Only the way a person enters it changed — the wire format
 * is still "HH:MM" 24h, which is what `Habit.time` stores and what the notifier
 * and every habit row already read.
 */
import { useState } from "react";
import { Platform, View } from "react-native";
import { useTranslation } from "react-i18next";
import DateTimePicker from "@react-native-community/datetimepicker";
import { PressScale, Text, colors, fonts } from "../ui";

/** A Date → the "HH:MM" the habit stores. */
export const hhmm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "HH:MM" → today at that time. Anything else (empty, half-typed, legacy junk) → 08:00. */
export function atTime(s: string, now: Date = new Date()): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? "");
  const h = m ? Number(m[1]) : 8;
  const min = m ? Number(m[2]) : 0;
  const d = new Date(now);
  d.setHours(h <= 23 ? h : 8, min <= 59 ? min : 0, 0, 0);
  return d;
}

/** 24-hour clock? Ask the device's locale instead of hardcoding a country. */
export const is24h = (): boolean => !/[ap]\.?\s?m/i.test(new Date(2020, 0, 1, 13).toLocaleTimeString());

/**
 * The whole "Reminder time" row: the tappable value, the hint beside it, and the
 * picker underneath (iOS renders a wheel inline, Android a dialog over the app —
 * hence the picker sits below the row, not inside it).
 */
export function TimeField({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 11 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t("library.habits.timeLabel")}
          accessibilityValue={{ text: value }}
          onPress={() => setOpen(true)}
          style={{
            borderWidth: 1,
            borderColor: colors.borderControlStrong,
            backgroundColor: colors.input,
            borderRadius: 14,
            paddingVertical: 10,
            width: 78,
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 14 }} color={colors.ink}>
            {value}
          </Text>
        </PressScale>
        <Text style={{ fontSize: 11, lineHeight: 16, flex: 1 }} color={colors.labelMuted}>
          {t("library.habits.timeHint")}
        </Text>
      </View>
      {open ? (
        <DateTimePicker
          testID="habit-time-picker"
          value={atTime(value)}
          mode="time"
          is24Hour={is24h()}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(e, d) => {
            // Android's dialog is modal and one-shot; iOS' wheel stays and streams changes.
            if (Platform.OS !== "ios") setOpen(false);
            if (d && e.type !== "dismissed") onChange(hhmm(d));
          }}
        />
      ) : null}
    </View>
  );
}
