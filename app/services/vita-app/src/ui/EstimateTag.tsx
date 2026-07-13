import { View } from "react-native";
import { colors, fonts } from "./tokens";
import { Text } from "./Text";

/** The "estimate" pill every AI-derived number carries. Caller passes t()'d label. */
export function EstimateTag({ label }: { label: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.estimateBg,
        borderRadius: 8,
        paddingHorizontal: 7,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.extraBold,
          fontSize: 9.5,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
        color={colors.estimateInk}
      >
        {label}
      </Text>
    </View>
  );
}
