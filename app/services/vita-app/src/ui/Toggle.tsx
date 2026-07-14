import { Pressable, View } from "react-native";
import { colors } from "./tokens";

/** The earthy on/off switch from the prototype (integrations, notifications). */
export function Toggle({
  on,
  onToggle,
  accessibilityLabel,
  onColor = colors.accent,
}: {
  on: boolean;
  onToggle: () => void;
  accessibilityLabel?: string;
  onColor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel}
      onPress={onToggle}
      style={{ width: 46, height: 27, borderRadius: 15, backgroundColor: on ? onColor : colors.track, justifyContent: "center" }}
    >
      <View
        style={{
          position: "absolute",
          top: 3,
          left: on ? 22 : 3,
          width: 21,
          height: 21,
          borderRadius: 11,
          backgroundColor: colors.card,
        }}
      />
    </Pressable>
  );
}
