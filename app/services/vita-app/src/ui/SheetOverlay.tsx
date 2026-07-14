import { type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, SlideInDown } from "react-native-reanimated";
import { colors, motion, spacing } from "./tokens";
import { useSheetDrag } from "./useSheetDrag";
import { KeyboardLift } from "./keyboard";

/**
 * The app's one bottom-sheet chrome (Fable A4): dimmed backdrop that fades in,
 * sheet that rises on the prototype's pop bezier (`vtSheetUp`) and really drags
 * closed via the worklet-side `useSheetDrag` — replaces the stock RN `Modal`
 * (`animationType="slide"/"fade"`) whose handle bar was decorative. Render it
 * last inside a screen; it absolute-fills that screen.
 * `lift` rides the sheet above the keyboard (sheets with text fields).
 */
export function SheetOverlay({
  visible,
  onClose,
  children,
  closeLabel,
  lift = false,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessibility label for the backdrop close target (e.g. t("common.cancel")). */
  closeLabel?: string;
  lift?: boolean;
}) {
  const { dragGesture, sheetStyle } = useSheetDrag(onClose); // hook above the early return
  if (!visible) return null;
  return (
    <View style={{ position: "absolute", inset: 0, justifyContent: "flex-end", zIndex: 50 }}>
      <Animated.View entering={FadeIn.duration(motion.fade.durationMs)} style={{ position: "absolute", inset: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={{ flex: 1, backgroundColor: "rgba(60,50,38,0.35)" }}
        />
      </Animated.View>
      <KeyboardLift enabled={lift}>
        <GestureDetector gesture={dragGesture}>
          <Animated.View
            entering={SlideInDown.duration(motion.pop.durationMs).easing(Easing.bezier(...motion.pop.bezier).factory())}
            style={[
              {
                backgroundColor: colors.sheet,
                margin: 6,
                borderRadius: 30,
                padding: spacing.xl - 4,
                paddingBottom: spacing.xl,
                gap: spacing.md + 2,
              },
              sheetStyle,
            ]}
          >
            <View
              style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(120,100,75,0.18)", alignSelf: "center" }}
            />
            {children}
          </Animated.View>
        </GestureDetector>
      </KeyboardLift>
    </View>
  );
}
