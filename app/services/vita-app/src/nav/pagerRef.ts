import type { GestureType } from "react-native-gesture-handler";

/**
 * Shared handle to the single app-wide horizontal pan. In v3 that was the 5-tab
 * `TabsPager`; in v4 (APP-096) it is `PanelShell`'s edge-swipe — the NAME is kept
 * on purpose so `scrub.tsx`, `DockDatePicker.tsx` and `Timeline.tsx` need zero edits.
 *
 * Inner horizontal gestures import this and pass it to `.blocksExternalGesture()`
 * so they win the drag — the panel pan waits for them to fail before activating.
 * Lives in its own leaf module so those files can reference it without importing
 * the shell (which would create a Trends→shell→Trends import cycle).
 */
export const tabsPagerRef: { current: GestureType | undefined } = { current: undefined };
