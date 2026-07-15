import { type PressableProps } from "react-native";
import { colors, radii, shadowCta, spacing } from "./tokens";
import { PressScale } from "./PressScale";
import { Text } from "./Text";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: "primary" | "ghost";
};

export function Button({ label, variant = "primary", disabled, ...rest }: ButtonProps) {
  const primary = variant === "primary";
  return (
    <PressScale
      accessibilityRole="button"
      disabled={disabled}
      scale={0.98} // full-width CTA — a gentle press (prototype .98), not the .94 of round buttons
      style={{
        backgroundColor: primary ? colors.accent : "transparent",
        borderWidth: primary ? 0 : 1.5,
        borderColor: primary ? undefined : "rgba(120,100,75,0.16)",
        borderRadius: radii.pill,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        alignItems: "center",
        opacity: disabled ? 0.45 : 1,
        // Prototype tints a primary CTA's shadow with the accent (`0 10px 22px accent@35%`);
        // ghost/disabled buttons stay flat (they do in the prototype too).
        ...(primary && !disabled ? shadowCta(colors.accent) : null),
      }}
      {...rest}
    >
      <Text variant="label" color={primary ? colors.card : colors.accent}>
        {label}
      </Text>
    </PressScale>
  );
}
