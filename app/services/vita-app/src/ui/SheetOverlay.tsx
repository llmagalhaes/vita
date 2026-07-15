import { type ReactNode } from "react";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { colors, spacing } from "./tokens";
import { useSheetTransition } from "./useSheetDrag";
import { KeyboardLift } from "./keyboard";
import { SheetBackdrop } from "./SheetBackdrop";
import { useSheetPresence } from "./sheetPresence";

/**
 * The app's one bottom-sheet chrome (Fable A4): dimmed backdrop and a sheet that
 * springs up on open and — via `useSheetTransition` — slides back DOWN + fades the
 * backdrop on close, whether that close comes from a drag-dismiss or a save/confirm
 * flipping `visible` false (APP-042: no more abrupt snap). Replaces the stock RN
 * `Modal`. Render it last inside a screen; it absolute-fills that screen.
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
  const { rendered, sheetStyle, backdropStyle, dragGesture, onSheetLayout } = useSheetTransition(visible, onClose);
  useSheetPresence(visible); // hide the floating tab bar while this sheet is up (CEO #1)
  if (!rendered) return null;
  return (
    <View style={{ position: "absolute", inset: 0, justifyContent: "flex-end", zIndex: 50 }}>
      <SheetBackdrop onClose={onClose} closeLabel={closeLabel} style={backdropStyle} />
      <KeyboardLift enabled={lift}>
        <GestureDetector gesture={dragGesture}>
          <Animated.View
            onLayout={onSheetLayout}
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
