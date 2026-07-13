import { View } from "react-native";
import { colors } from "./tokens";

/** Horizontal reference bar (macros, micros). pct is clamped 0–100. */
export function Bar({ pct, color, height = 7 }: { pct: number; color: string; height?: number }) {
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.track,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, pct))}%`,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
