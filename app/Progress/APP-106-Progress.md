# APP-106 — Single day-close notification (replaces per-meal check-ins)

Wave 4, v4. Builder: Opus. Gates: `npx tsc --noEmit` 0 · `npx jest` **481/481, 69 suites**.

## What shipped

One local notification per day at `recapStartHour` (default 20:00 — the same hour the
timeline's Close-the-day card appears, so the lock screen and the app never disagree).
It replaces **both** v3's evening recap (APP-089) and the per-meal check-in / plan-digest
notifications.

Copy is prototype-exact (`Vita Prototype v4.dc.html` lines 97–119, `lockLine` at 1574):

- title `Close your day?`
- body `{meals} still marked planned. One tap records the rest as it was planned.`
  (or `Everything is confirmed. One tap records the rest as it was planned.`)
- second body line `Ignoring this leaves the day unrecorded — Vita never assumes.`
- actions `Close as planned` · `I'll adjust`

Pending meals are computed **at the close hour**, not at "now" — that is when the user
reads it and it is exactly the set `closeDay()` records. A 23:00 meal is not called
pending at 20:00.

## Files

New:
- `src/notify/notifier.ts` — moved from `src/habits/notifier.ts`. `syncRecap` →
  `syncDayClose`; new `onResponse` on the seam; `plannedNotifications` lost the
  digest-body injection and now schedules **only `kind: "plain"` habits** (the per-meal
  check-in / digest notification scheduling — the ticket's DELETE item).
- `src/notify/dayClose.ts` — `plannedDayClose` (pure gate + copy), `syncDayClose` (live
  state → seam), `applyDayCloseAction` (the two buttons), `startDayClose` (mount wiring),
  `habitBody`.
- `src/notify/__tests__/notifier.test.ts` (7 tests) · `src/notify/__tests__/dayClose.test.ts` (9 tests).

Deleted: `src/habits/digest.ts`, `src/habits/recap.ts`, `src/habits/__tests__/{digest,recap,notifier}.test.ts`.

Edited:
- `src/habits/notifier.ts` → 1-line re-export shim (see *Deviations*).
- `app/(main)/_layout.tsx` — `useEffect(() => startDayClose(), [])`, next to the existing
  `startReconnectDrain()`.
- `app/(main)/account.tsx` — the two `syncRecapFromLog()` calls → `syncDayClose()`.
- `src/library/sections/Habits.tsx` — import path.
- `src/tabs/Home.tsx` (dead v3 route) — dropped the recap import + effect.
- `src/i18n/locales/en.json` — new `notify.*` region (`notify.habit`, `notify.dayClose.*`).

Test delta: **−3 suites / +2 suites**, 16 tests in the new region.

## Acceptance

| Criterion | Where |
|---|---|
| exactly one per day | `dayClose.test.ts` "schedules exactly one…" — one id, cancel-then-reschedule, re-sync never adds a second alarm |
| never during vacation | "nothing is scheduled during a trip" (`notificationsPaused()` = master switch OR `isVacationActive()`) |
| not when the day is already closed | "nothing is scheduled once the day is closed" (`isDayClosed`) |
| body lists the right pending meals | 3 pure tests (all pending · one recorded · none pending · not-yet-due) |
| actions degrade to open-the-app | `setNotificationCategoryAsync` is try/caught; a plain tap carries the OS default action id, which `applyDayCloseAction` routes to "open the Day, record nothing" |

Per APP-103's rules, kept as-is: the whole gate is `notificationsPaused()`, and
`scheduledHabits()` still lets a keep-water trip keep its water reminder — the day-close
notification is not a habit, so it is cancelled on any trip.

## Deviations / cross-ownership honesty

1. **`src/habits/notifier.ts` survives as a 1-line `export * from "../notify/notifier"` shim.**
   `src/db/vacation.ts:65` reaches the notifier through a *lazy require by path string*
   (which tsc cannot check), and `db/vacation.ts` is another builder's file this wave.
   `src/db/__tests__/vacation.test.ts`, `src/__tests__/plan-setup.test.tsx` (`jest.mock`)
   and the two dead v3 tabs also import by that path. **APP-108: delete the shim + fix
   that require.**
2. **`src/habits/CheckinSheet.tsx` NOT deleted** — still referenced by
   `app/(main)/_layout.tsx` (mounted) and `src/tabs/Habits.tsx` (dead v3 route). It is
   already inert in v4: the only caller of `openCheckins()` is `src/tabs/Home.tsx`, whose
   route redirects to `/day`, and `src/day/overview/HabitsCard.tsx` answers check-ins
   inline. Only the *scheduling* half was removed, per the ticket. **Deferred to APP-108**
   (together with `src/tabs/{Home,Habits}.tsx` and the `kind` field in `src/db/habits.ts`).
3. **Two files outside `src/notify/` were edited** and are flagged here:
   `app/(main)/_layout.tsx` (3 lines: import + one effect — the day-close notification has
   no other always-mounted host) and `app/(main)/account.tsx` (import + 2 call sites, the
   only live caller of the deleted `syncRecapFromLog`).
4. **`src/db/notify.ts` was NOT edited** — a parallel builder had already added
   `onChange()` (APP-110); `startDayClose` reuses it to keep the body in step with the log
   instead of adding a second subscriber export.
5. **`recapEnabled()` (`notifRecap`) still gates it.** The Account screen's "evening recap"
   switch and hour stepper now drive the day-close notification. Reusing the setting was
   the ponytail call (R7 already says reuse `recapStartHour`); if the CEO wants the label
   changed, that is an i18n one-liner in APP-108.
6. `isDayClosed` / `setDayClosed` live in `src/day/timeline/Timeline.tsx` (a `.tsx`), so
   `dayClose.ts` reaches them with a **lazy require** to stay loadable without React. A
   `ponytail:` comment marks it — APP-108 may move them to a leaf module.
7. `plan/setup.tsx`'s v3 `recapLine(nMeals, nWorkouts, waterMl)` is now unreferenced by the
   notification path (`src/day/state.ts` has the v4 one). Left alone — v3 sweep is APP-108.

## Device-only

Scheduling, the two lock-screen buttons and the response listener need a dev build; Expo Go
falls back to `stubNotifier()`. The response listener is registered after auth, so a cold
start from the notification tap depends on `addNotificationResponseReceivedListener`
replaying the launch response — flagged for the next APK drive.
