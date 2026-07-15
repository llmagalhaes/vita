import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Text } from "./Text";
import { colors, fonts, motion, shadowDark } from "./tokens";
import { useToast } from "./toast";

/**
 * The one toast pill host (APP-055). Mount once in the app shell. Dark pill above
 * the tab bar (`#453E35`), single line, fades in/out; content + timing owned by the
 * `toast` module store.
 */
export function ToastHost() {
  const message = useToast();
  if (!message) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 122, alignItems: "center", paddingHorizontal: 16 }}>
      <Animated.View
        entering={FadeIn.duration(motion.fade.durationMs)}
        exiting={FadeOut.duration(200)}
        style={{ backgroundColor: "#453E35", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 18, maxWidth: "100%", ...shadowDark }}
      >
        <Text variant="label" style={{ fontFamily: fonts.semiBold, fontSize: 13 }} color="#F7F0E4" numberOfLines={1}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
