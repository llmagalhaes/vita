// Pure dismiss decision for the capture sheet's drag-down gesture (testable).
// Dismiss when dragged far enough OR flicked down fast enough; otherwise spring back.
export const DISMISS_DISTANCE = 120; // px
export const DISMISS_VELOCITY = 800; // px/s

export const shouldDismiss = (translationY: number, velocityY: number): boolean => {
  "worklet"; // callable from the gesture worklet (UI thread) AND from JS/tests
  return translationY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY;
};

/**
 * Backdrop opacity as the sheet travels from open (translateY 0 → opacity 1) to
 * fully slid out (translateY = sheet height → opacity 0). Same driver for drag and
 * programmatic close, so both dim/undim the background identically. Clamped 0..1.
 */
export const backdropOpacityAt = (translateY: number, height: number): number => {
  "worklet"; // read inside the animated backdrop style (UI thread) AND from tests
  if (height <= 0) return 1;
  const t = Math.min(1, Math.max(0, translateY / height));
  return 1 - t;
};
