import { View, type ViewProps } from "react-native";
import { colors, radii, shadow, spacing } from "./tokens";

export function Card({ style, ...rest }: ViewProps) {
  return (
    <View
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
