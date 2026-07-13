import { Pressable, type PressableProps } from "react-native";
import { colors, radii, spacing } from "./tokens";
import { Text } from "./Text";

export type ChipProps = Omit<PressableProps, "children"> & {
  label: string;
  selected?: boolean;
};

export function Chip({ label, selected = false, ...rest }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        backgroundColor: selected ? colors.accent : colors.surface,
        borderRadius: radii.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        alignSelf: "flex-start",
      }}
      {...rest}
    >
      <Text variant="label" color={selected ? colors.card : colors.ink}>
        {label}
      </Text>
    </Pressable>
  );
}
