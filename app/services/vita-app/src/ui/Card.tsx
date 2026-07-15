import Animated from "react-native-reanimated";
import { colors, radii, shadow, spacing } from "./tokens";

/**
 * The shared card surface. Renders an Animated.View (identical to View when no
 * animation props are passed) so callers can opt into a `layout` transition —
 * e.g. the Home expanders animate their height on expand/collapse like the
 * prototype (CEO batch #3) by passing `layout={LinearTransition...}`.
 */
export function Card({ style, ...rest }: React.ComponentProps<typeof Animated.View>) {
  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radii.lg,
          padding: spacing.lg,
          ...shadow,
        },
        style,
      ]}
      {...rest}
    />
  );
}
