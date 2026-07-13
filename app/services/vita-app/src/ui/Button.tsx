import { Pressable, type PressableProps } from "react-native";
import { colors, radii, spacing } from "./tokens";
import { Text } from "./Text";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: "primary" | "ghost";
};

export function Button({ label, variant = "primary", ...rest }: ButtonProps) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: primary ? colors.accent : "transparent",
        borderRadius: radii.pill,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        alignItems: "center",
        opacity: pressed ? 0.8 : 1,
      })}
      {...rest}
    >
      <Text variant="label" color={primary ? colors.card : colors.accent}>
        {label}
      </Text>
    </Pressable>
  );
}
