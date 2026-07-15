import Svg, { Path } from "react-native-svg";
import { colors } from "./tokens";
import { PressScale } from "./PressScale";

/**
 * The one round back button, sized to the prototype's noticeably-large chrome
 * (CEO batch #8). A bold SVG chevron that fills the circle — replaces the thin
 * text "‹" glyphs the screens used, which read tiny inside their circles.
 */
export function BackButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        borderColor: "rgba(120,100,75,0.16)",
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={22} height={22} viewBox="0 0 18 18">
        <Path d="M11.2 4 L6 9 L11.2 14" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </PressScale>
  );
}
