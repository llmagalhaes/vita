import type { GestureType } from "react-native-gesture-handler";

/**
 * Shared handle to the single app-wide tab pager gesture. Inner horizontal
 * gestures (Trends scrub) import this and pass it to `.blocksExternalGesture()`
 * so they win the drag — the pager waits for them to fail before activating.
 * Lives in its own leaf module so `scrub.tsx` can reference it without importing
 * `TabsPager` (which would create a Trends→pager→Trends import cycle).
 */
export const tabsPagerRef: { current: GestureType | undefined } = { current: undefined };
