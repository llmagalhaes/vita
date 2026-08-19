# APP-102 — Habit detail sheet + habit statistics

Session 22 (v4 round). Builder: Opus. Spec: `docs/v4/app-plan.md` §APP-102,
`docs/v4/README.md` §3 "Habit detail sheet" + §5 copy rules, prototype
`Vita Prototype v4.dc.html` lines 1233–1290 (markup) and 1713–1733 (state).

## What shipped

**`src/habits/stats.ts`** (new, pure — no db, no React, no clock of its own).
`habitStats({habitId, entries, today, vacationRanges})` → `{monthCount, totalCount,
topWeekdays, since, monthStart, calendar, months, weekdays}`, computed entirely from real
`checkin` entries. The prototype's `doneAt`/`mCnt` synthetic generators are **not** ported.

- `doneDayKeys()` filters `type === "checkin"` + `detail.habitId` + `answer === "yes"`, and
  keys each row by the **date in its id** (`habitId:YYYY-MM-DD`, written by
  `checkins.answerCheckin`) — that date is the day the check-in answers; `occurredAt` is only
  the fallback for a row whose id came from elsewhere.
- Calendar: current month, leading blanks so day 1 sits under its weekday (Sunday-first grid,
  as the prototype — the sheet draws no weekday header), each cell carrying
  `{day, key, offset, done, future, onVacation}`.
- 8 by-month bars (index 7 = current month) counted per calendar month; 30-day weekday
  frequency Mon-first; `since` = earliest recorded day.
- Geometry helpers so the numbers are testable, not buried in JSX: `monthBarHeight`
  (`round(count/max*42 + 5)`, `max` floored at 1), `weekdayDiameter` (`8 + share*14`),
  `weekdayOpacity` (`.35 + share*.65`, zero → `.25`), `canOpenDay(offset)` against
  `DOCK_DAYS = 10`.
- Vacation comes from `vacationExcluder()` (reused from `src/trends/aggregate.ts`) over the
  real ranges — no hardcoded window, and it tolerates full-ISO range bounds.

**`src/habits/HabitDetailSheet.tsx`** (new) — `{habit, onClose, onOpenDay?}` on the app's one
`SheetOverlay`. Reads its own entries (`entriesInRange("checkin", epoch, tomorrow)` — check-ins
are few) + `vacationRanges()`, re-reading on `useLogVersion()`, so the Trends rebuild (APP-100)
only has to pass the habit and a day-jump callback.

Sections, exact geometry: name 17/700 + schedule/`recorded since` subline 11.5/600 →
3 counter tiles (flex, `#FFFDF7` r16, 11×8, value 15/800, label 9.5/800 ls .7 upper) →
current-month calendar (34px cells r11, 4px gutters, done `#8CA58A`/`#FFF9F1`, not-done
`#F0EDE2`/`#6E6355`, future transparent `#D9CFBD` and **inert** (`disabled`), selected 2px accent
outline; tap → `date · done|not marked [· you were on vacation]` over a dashed divider, with
`Open this day →` only inside the dock's 10-day reach) → 8 by-month bars (r5, current `#8CA58A`,
others `#D5CBB8`, count 9.5/800 above, month 8.5/800 below) → 7 weekday circles (Mon-first,
Ø `8+share*14`, opacity `.35+share*.65`, zero `.25`) → footer, verbatim:
`Counts of recorded days — never a score, never a streak.`

**`src/i18n/locales/en.json`** — new `habitDetail.*` namespace only (14 keys). Weekday and
month names come from `toLocaleDateString`, not from a hardcoded array; the schedule line reuses
the existing `habits.everyDay`.

**`src/habits/__tests__/stats.test.ts`** (new, 15 tests) — id-vs-occurredAt keying, other habits
and non-`yes` answers excluded, month/total/top-2 weekdays, tie-break Mon-first, calendar blanks
+ future flags, vacation annotation from real ranges (plain and full-ISO), 8-bar month history,
30-day weekday window, the zero-history empty shape (no division by zero anywhere), and the
geometry formulas.

## Decisions / deviations worth a reviewer's eye

1. **"Most often" reads the whole history**, not the 30-day window the prototype uses. It sits
   beside "total", so its scope matches that tile; the prototype only had 30 synthetic days to
   read from. Zero-count weekdays are dropped, so a habit with no history shows `—` instead of
   two arbitrary day names.
2. **The sections scroll, the header drags.** The sheet's pan gesture (`activeOffsetY(10)`) and a
   `ScrollView` cannot both own a downward swipe, so the header + tiles stay outside the scroll
   view (handle-drag and backdrop-tap still dismiss) and the three cards scroll inside
   `maxHeight: 55%` — the prototype's `max-height:80%` on the whole sheet.
3. **The last habit is held in a ref** while the sheet slides back down, so the exit animation
   isn't an empty card (`visible={habit != null}` unmounts the content one frame too early).
4. `#FFF9F1` (the done cell's warm ink) is written inline: it exists nowhere else in the design
   and `src/ui/tokens.ts` is outside this ticket's file scope.

## Gates

- `npx tsc --noEmit` — **0 errors in `src/habits/`**. The run reports 12 pre-existing
  cross-ownership errors in other builders' trees (`src/capture/CapturePill.tsx`,
  `CaptureSheet.tsx`, `src/db/__tests__/vacation.test.ts`, `src/__tests__/account.test.tsx`,
  `src/vacation/__tests__/vacation-sheet.test.ts` — `VacationConfig.keepCheckins` → `keepWater`
  and the CaptureContext reshape). Reported, not touched.
- `npx jest src/habits` — **5 suites, 34 tests, all green** (was 19 tests; +15).

## Handoff to APP-100

```tsx
<HabitDetailSheet habit={openHabit} onClose={() => setOpenHabit(null)} onOpenDay={jumpToDay} />
```

`onOpenDay(offset)` receives days-before-today and is only ever called for `offset < 10`
(the sheet closes itself first). The sheet renders nothing while `habit` is `null`.
