# APP-011 · Capture pill + text capture flow — Progress

- Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216514543339475
- Status: **built, tests green** (2026-07-13). Done = in production.

## What exists

- `src/ui/tokens.ts` — motion tokens added: the prototype's two cubic-beziers (`pop` .2,.8,.3,1 · `unfold` .22,.9,.32,1) + durations; `entryPalette` per entry kind.
- `src/capture/CapturePill.tsx` — v2 pill only (CEO Round 5): mic bubble, text field + camera that unfold via Reanimated `withTiming` with the `unfold` bezier, Today/Trends/Habits shortcuts (SVG icons per prototype). Tap mic toggles the field; **hold-to-talk is APP-012**. Camera button shows a factual toast ("Photo capture isn't in this build yet.").
- `src/capture/CaptureContext.tsx` — state machine idle → parsing → review → (error), submit/confirm/discard/adjust. Confirm: instant local write via outbox + background drain. Adjust: phrase returns to the pill field. Toast "Added to your log".
- `src/capture/CaptureSheet.tsx` — bottom sheet (SlideInDown, pop bezier): "Making sense of it…" with the phrase quoted verbatim; confirmation card (title, time, kcal + **estimate tag**, macro trio, micro chips; water/workout variants with muscle chips); stacked drafts advance one by one ("1 of 2"); error state with retry.
- Always-present: pill + sheet + toast live in `app/(main)/_layout.tsx` over every main screen.
- Tests: 3 RNTL flows (parse→confirm→outbox drained; meal+water stack; adjust returns phrase, nothing logged before confirmation).

## Deliberate cuts

- Offline pending-interpretation (phrase queued as unparsed outbox item, visible in timeline) not built — mock parse cannot fail offline. Build together with the real API URL; error state covers the UX meanwhile.
- Confirmation card is advance-one-by-one, not the swipeable stack; swipe gesture polish later (Gesture Handler already installed).
- No voice (APP-012), no photo (separate ticket).
