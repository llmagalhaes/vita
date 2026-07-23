import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Text } from "./Text";
import { colors, fonts, motion, shadowDark } from "./tokens";
import { runToastUndo, useToast } from "./toast";

/**
 * The one toast pill host (APP-055). Mount once in the app shell. Dark pill above
 * the tab bar (`#453E35`), single line, fades in/out; content + timing owned by the
 * `toast` module store. v3 (APP-083): when the toast carries an `undo`, an "Undo"
 * link follows the message — so the root is `box-none` (lets touches through) while
 * the pill itself is `auto` (tappable).
 */
export function ToastHost() {
  const toast = useToast();
  const { t } = useTranslation();
  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 122, alignItems: "center", paddingHorizontal: 16 }}>
      <Animated.View
        pointerEvents="auto"
        entering={FadeIn.duration(motion.fade.durationMs)}
        exiting={FadeOut.duration(200)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#453E35",
          borderRadius: 18,
          paddingVertical: 10,
          paddingHorizontal: 18,
          maxWidth: "100%",
          ...shadowDark,
        }}
      >
        <Text variant="label" style={{ fontFamily: fonts.semiBold, fontSize: 13, flexShrink: 1 }} color="#F7F0E4" numberOfLines={1}>
          {toast.text}
        </Text>
        {toast.undo && (
          <Pressable accessibilityRole="button" onPress={runToastUndo} hitSlop={8} style={{ marginLeft: 10 }}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 13 }} color={colors.toastUndo}>
              {t("toast.undo")}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}
