import { View } from "react-native";
import { Button } from "./Button";
import { SheetOverlay } from "./SheetOverlay";
import { Text } from "./Text";
import { colors, spacing } from "./tokens";

/**
 * Small reusable "are you sure?" sheet (APP-046) — a title, optional body
 * copy, a confirm action and a cancel, on the shared SheetOverlay chrome.
 * `destructive` is accepted for callers that want to flag a one-way action;
 * the calm earthy palette has no separate danger color, so it currently just
 * reuses the accent Button (ponytail: add a danger tone if a future confirm
 * needs to read as more severe than this one).
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  destructive: _destructive = false,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
}) {
  return (
    <SheetOverlay visible={visible} onClose={onClose} closeLabel={cancelLabel}>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <Text variant="title" style={{ fontSize: 18 }}>{title}</Text>
          {message ? (
            <Text variant="caption" color={colors.muted}>{message}</Text>
          ) : null}
        </View>
        <Button label={confirmLabel} onPress={onConfirm} />
        <Button label={cancelLabel} variant="ghost" onPress={onClose} />
      </View>
    </SheetOverlay>
  );
}
