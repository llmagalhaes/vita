# R18-E — habit taps feel slow ("podemos fazer eles assíncrono?")

CEO, real Samsung, prod build: the check-in ✓/— buttons and the Library habit switches
lag behind the finger. Suspected backend. It is not the backend.

## What the trace actually found

`answerCheckin` (and the Library's `afterChange`) never awaited the network — the app is
offline-first and the write is synchronous local SQLite. What rode the tap frame was the
**app-wide invalidation** that followed the write, all of it before React could paint the
pressed row:

Check-in ✓ tap → `HabitsCard.answer()`:

1. `upsertCheckin` → `getEntry` SELECT + transaction (INSERT entry + INSERT outbox) +
   `invalidateDay` (DELETE day_record) — ~1 ms, and **required** (the day's `dirty` flag
   counts any unsynced entry, check-ins included), so it stays where it is.
2. `logChanged()` — **synchronous fan-out**, ~15 React subscribers + 2 module ones, and
   all three panels are pre-mounted:
   - `DayPanel` memo: `getDayRecord()` — the cache row was just invalidated, so it
     **rebuilds** from the day's entries — + `getCachedPlan()` (kv SELECT + `JSON.parse`
     of the whole plan doc: 42 items / 308 swaps) + `dayCounters` + `entriesForDay` +
     `listHabits` + `latestWeight` + `planDailyTotals`; then Timeline, DayDock,
     ScenicHeader, DayBanners, VacationBanner re-render.
   - `TrendsPanel` (off-screen, mounted): buckets, `yearCounters`, two `entriesInRange`,
     `weightSeries`, `sessionsFromEntries`, `muT`, `trendChips`.
   - `LibraryPanel` + its six sections.
   - `notify/dayClose.startDayClose`'s `onChange` → `syncDayClose()` → `getDayRecord` +
     `getCachedPlan` AGAIN, then a notifier cancel/schedule pass.
   - `settingsSync` → arms the 1.5 s debounced `PUT /me/settings`.
3. `void drainOutbox(api)` — fire-and-forget, but its **prologue is synchronous** (outbox
   SELECT + `getEntry` + payload build) and ran on the same frame; on its response it
   fires `logChanged()` a **second** time → the whole cascade again, ~a network round-trip
   after the tap (the "it's talking to the backend" feeling).
4. `showToast`.

Library switch → `toggleNotif()`: `updateHabit` (sync UPDATE) → same `logChanged()`
cascade → `refreshNotifications()` (serialized cancel-all + reschedule every alarm) →
and only then does the controlled `<Toggle on={h.enabled}>` receive its new prop and
start its 220 ms knob tween.

**No await on the tap path. One synchronous whole-app recompute (twice per answer).**

## Fix — optimistic where it already was, deferred where it never needed to be

The write is local and synchronous, so **re-reading it in the pressed component IS the
optimistic update** — no mirrored state, no reconcile path, no new sync machinery:

- `src/habits/checkins.ts` — `answerCheckin` keeps the synchronous `upsertCheckin`
  (`applyCheckinAction`'s double-apply guard and the cold-start replay still see the
  answer on the same tick; its signature is untouched), and wraps `logChanged()` +
  `drainOutbox` in `InteractionManager.runAfterInteractions`.
- `src/day/overview/HabitsCard.tsx` — a local `repaint()` after the answer (and after the
  toast's Undo `deleteEntry`) re-reads the db in this card only; the chip is on screen
  before anything else re-reads. Undo's `logChanged()` is deferred the same way.
- `src/library/sections/Habits.tsx` — `afterChange()` (`logChanged` +
  `refreshNotifications`) now runs after interactions; `repaint()` at toggle / remove /
  undo flips the switch immediately.

Nothing else changed: same entries, same outbox ops, same idempotency keys, no spinner,
no success toast. Errors keep reconciling exactly as before (offline → outbox backoff).

Not done, deliberately: `logChanged` stays a blunt app-wide signal (a per-domain signal is
a bigger change than the symptom warrants), and the double `logChanged` on drain success
stays — it is what turns "waiting to sync" off, and it is now off the tap frame anyway.

## Gates

- `npx tsc --noEmit` → 0
- `npx jest` → 614 passed / 1 skipped. My suites green (`checkins`, `stats`, `timeField`,
  `library-panel`, `overview`); the 2 red suites are siblings' in-flight files
  (`src/build/food/__tests__/draft.test.ts`, `src/nav/__tests__/panelShell.test.tsx`).
- +1 test: "the answer is readable on the tap tick, the app-wide fan-out is not on it".
