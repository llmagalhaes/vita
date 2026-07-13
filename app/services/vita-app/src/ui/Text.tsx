import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { colors, fonts, fontSizes } from "./tokens";

type Variant = keyof typeof fontSizes;

const variantFont: Record<Variant, string> = {
  caption: fonts.regular,
  label: fonts.semiBold,
  body: fonts.regular,
  title: fonts.bold,
  display: fonts.extraBold,
};

export type TextProps = RNTextProps & {
  variant?: Variant;
  color?: string;
};

export function Text({ variant = "body", color, style, ...rest }: TextProps) {
  return (
    <RNText
      style={[
        {
          fontFamily: variantFont[variant],
          fontSize: fontSizes[variant],
          color: color ?? (variant === "caption" ? colors.muted : colors.ink),
        },
        style,
      ]}
      {...rest}
    />
  );
}
