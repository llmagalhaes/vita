// Pure dismiss decision for the capture sheet's drag-down gesture (testable).
// Dismiss when dragged far enough OR flicked down fast enough; otherwise spring back.
export const DISMISS_DISTANCE = 120; // px
export const DISMISS_VELOCITY = 800; // px/s

export const shouldDismiss = (translationY: number, velocityY: number): boolean => {
  "worklet"; // callable from the gesture worklet (UI thread) AND from JS/tests
  return translationY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY;
};
