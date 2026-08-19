/**
 * The three shapes every Library section is made of (prototype lines 716–866).
 * Kept here so the seven section files carry content, not chrome.
 */
import { type ReactNode } from "react";
import { Pressable, TextInput, View, type ViewStyle } from "react-native";
import { Text, colors, fonts, letterSpacing, mixOklab, radii, typeScale } from "../ui";

/** `color-mix(in oklab, accent 12%, #FFFDF7)` — the prototype's tinted-button fill. */
export const tinted = (accent: string) => mixOklab(accent, 12, colors.card);

/** Uppercase eyebrow above each section — 11.5/800 ls 1.4, `padding 6px 4px 0`. */
export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingTop: 6 }}>
      <Text
        style={{
          fontFamily: fonts.extraBold,
          fontSize: typeScale.micro,
          letterSpacing: letterSpacing.zoneLabel,
          textTransform: "uppercase",
        }}
        color={colors.labelMuted}
      >
        {children}
      </Text>
      {right ? <View style={{ marginLeft: "auto" }}>{right}</View> : null}
    </View>
  );
}

/** Row-list surface: radius 22, `padding 4px 16px`, the lighter 12/26 shadow. */
export function ListCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 22,
          paddingVertical: 4,
          paddingHorizontal: 16,
          borderWidth: 1,
          borderColor: "rgba(120,100,75,0.07)",
          shadowColor: "#69543C",
          shadowOpacity: 0.08,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: 12 },
          elevation: 3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** One row inside a ListCard — hairline under every row, prototype `11px 0`. */
export function ListRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 11,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(120,100,75,0.07)",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The 10.5px honesty line that closes a ListCard. */
export const CardNote = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 10.5, paddingTop: 9, paddingBottom: 10 }} color={colors.labelMuted}>
    {children}
  </Text>
);

/** Rounded 38px icon well (leaf, link, sun, arrow) that opens most rows. */
export const IconWell = ({ bg, children }: { bg: string; children: ReactNode }) => (
  <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
    {children}
  </View>
);

/** Pill button — `tone` picks the prototype's outline / tinted / accent variants. */
export function PillButton({
  label,
  onPress,
  tone = "ghost",
  accent = colors.accent,
  height = 44,
  flex,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: "ghost" | "tinted" | "accent" | "danger";
  accent?: string;
  height?: number;
  flex?: number;
  disabled?: boolean;
}) {
  const bg = tone === "accent" ? accent : tone === "tinted" ? tinted(accent) : "transparent";
  const ink =
    tone === "accent" ? "#FFF9F1" : tone === "tinted" ? accent : tone === "danger" ? colors.danger : colors.inkMuted;
  const borderColor = tone === "danger" ? colors.dangerBorder : colors.borderControlStrong;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex,
        height,
        borderRadius: height / 2,
        backgroundColor: bg,
        borderWidth: tone === "ghost" || tone === "danger" ? 1.5 : 0,
        borderColor,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={ink}>{label}</Text>
    </Pressable>
  );
}

/** The sheet-style text field the add-meal / add-habit forms use. */
export function FormInput({
  value,
  onChangeText,
  placeholder,
  label,
  width,
  center,
}: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  label: string;
  width?: number;
  center?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.labelMuted}
      accessibilityLabel={label}
      style={{
        borderWidth: 1,
        borderColor: colors.borderControlStrong,
        backgroundColor: colors.input,
        borderRadius: width ? 14 : radii.innerBlockTight,
        paddingVertical: width ? 10 : 12,
        paddingHorizontal: width ? 0 : 15,
        fontFamily: fonts.semiBold,
        fontSize: width ? 14 : 14.5,
        color: colors.ink,
        width,
        textAlign: center ? "center" : "left",
      }}
    />
  );
}
