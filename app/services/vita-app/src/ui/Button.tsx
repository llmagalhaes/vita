import { Pressable, type PressableProps } from "react-native";
import { colors, radii, spacing } from "./tokens";
import { Text } from "./Text";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: "primary" | "ghost";
};

export function Button({ label, variant = "primary", disabled, ...rest }: ButtonProps) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: primary ? colors.accent : "transparent",
        borderWidth: primary ? 0 : 1.5,
        borderColor: primary ? undefined : "rgba(120,100,75,0.16)",
        borderRadius: radii.pill,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        alignItems: "center",
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
      {...rest}
    >
      <Text variant="label" color={primary ? colors.card : colors.accent}>
        {label}
      </Text>
    </Pressable>
  );
}
