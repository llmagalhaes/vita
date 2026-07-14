import { TextInput, type TextStyle } from "react-native";
import { Text } from "./Text";
import { colors, fonts } from "./tokens";

/**
 * One field that is plain Text when viewing and a TextInput when editing —
 * the whole "any field is editable" pattern for the plan/program screens. Static
 * and editing share `textStyle` so the layout doesn't jump between modes.
 */
export function EditableText({
  value,
  editing,
  onChangeText,
  placeholder,
  textStyle,
  numeric,
  multiline,
  accessibilityLabel,
}: {
  value: string;
  editing: boolean;
  onChangeText: (t: string) => void;
  placeholder?: string;
  textStyle?: TextStyle;
  numeric?: boolean;
  multiline?: boolean;
  accessibilityLabel?: string;
}) {
  if (!editing) {
    return (
      <Text style={{ fontFamily: fonts.semiBold, ...textStyle }}>{value || placeholder || ""}</Text>
    );
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.labelMuted}
      keyboardType={numeric ? "numeric" : "default"}
      multiline={multiline}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      style={{
        fontFamily: fonts.semiBold,
        color: colors.ink,
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 8,
        backgroundColor: "#FBF6EC",
        borderWidth: 1,
        borderColor: "rgba(196,112,78,0.35)",
        ...textStyle,
      }}
    />
  );
}
