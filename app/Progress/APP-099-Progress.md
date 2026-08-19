# APP-099 — Day travel: dock, calendar sheet, past days, retro-close

Session 22, v4. Builder: Opus. Sources: `docs/v4/README.md` §3 (Dock date picker) + §4 screen 3,
prototype `Vita Prototype v4.dc.html` lines 336–429 (label row · dock · past cards) and 887–911
(calendar sheet); model + rules from the **APP-094 ledger** (`dayStatus`, `retroClose`, `isRetro`).

## The rule this ticket is really about

A past day the user never touched is an **absence**, not a failure. Every surface here obeys it:
the calendar dot for such a day is a **ring**, never a fill; the card is dashed and quiet ("No
record for this day · Vita assumed nothing"); the only way it gains a record is the user's own
retro-close, which carries the honesty caption and an undo. Nothing in this ticket ever writes a
record on the user's behalf.

## Files

**Moved** (dock leaves the v3 Home tree, mechanics byte-identical)
- `src/tabs/home/dock.ts` → `src/day/dock/dock.ts`
- `src/tabs/home/DockDatePicker.tsx` → `src/day/dock/DockDatePicker.tsx`
- `src/tabs/home/__tests__/dock.test.ts` → `src/day/dock/__tests__/dock.test.ts` (so `jest src/day` covers it)
- path-only edits in the v3 consumers: `src/tabs/home/DaySection.tsx`, `src/tabs/home/Timeline.tsx`

**New**
- `src/day/dock/DayDock.tsx` — label row (Today / Yesterday / weekday · short date · "Today ↺" ·
  28px calendar button) + the dock + the calendar sheet. The only writer of `selection.ts`.
- `src/day/CalendarSheet.tsx` — month grid (7 cols, 42px cells, r13), status dot per day, accent
  selected cell, disabled future, legend. `monthCells` / `dotStyle` are pure and tested.
- `src/day/PastDay.tsx` — recorded card + movement card + unrecorded card + retro-close. `pastRows`
  is pure and tested.
- `src/day/statuses.ts` — `dayStatuses(start,end)` / `recentStatuses` / `monthStatuses`: day status
  for a RANGE, derived locally from `entries` with **one query per type**, not `getDayRecord()` per
  day (exactly what the APP-094 ledger's risk R6 asks for).
- `src/day/__tests__/dayTravel.test.tsx` — 10 tests.

**Changed**
- `src/day/dock/DockDatePicker.tsx` — new optional `statuses` prop + `dotBase()`: green as-planned ·
  amber adjusted · **ring** (transparent + 1.5px `ringNoRecord`) for no record; omitted = the v3
  neutral dock. Magnifier math, haptic-per-crossing, tooltip and the .55s overshoot release are
  untouched.
- `src/day/selection.ts` (this ticket owns it) — added `dateForOffset` / `offsetForDate` /
  `setSelectedOffset` / `getSelectedOffset`. **Every "Open this day →" caller speaks offsets**
  (muscle sheet rows, habit calendar, Trends week detail) — they call `setSelectedOffset(off)`;
  nothing needs to touch the dock.
- `src/day/DayPanel.tsx` — mounted `<DayDock/>` + `<PastDay/>` (see the fidelity note below).
- `src/ui/popHost.tsx` — added `usePortal(node)` (5 lines): the same portal PopOverlay already used,
  now reusable. Needed because the dock lives inside the Day panel's ScrollView, so a sheet declared
  there anchors to the tall scroll content instead of the screen.
- `src/db/entries.ts` — `LocalEntry.loggedAt` surfaced from the `updatedAt` column (2 lines). See
  "cross-ownership" below.
- `src/i18n/locales/en.json` — new `calendar.*` and `pastDay.*` regions (this ticket's only keys).
- `src/nav/__tests__/panelShell.test.tsx` — one line: `getByText("Today")` → `getAllByText(...) >= 2`,
  because the dock's day label is now a second "Today" next to the panel tab.
- `src/muscle/muscleData.ts` — stale dock path in a comment.

## Cross-ownership (honest list)

1. **`src/db/entries.ts` (APP-094's file), 2 lines.** `rowToEntry` never surfaced `updatedAt`, so
   `MealRecord.loggedAt` was always undefined and `isRetro` / `dayIsRetro` could **never fire** on a
   locally-built record — the acceptance criterion "retro-close distinguishable from a live close"
   was unreachable. Fixed at the root (one mapping every consumer routes through) rather than by
   re-deriving it in the past-day card. Ceiling: `loggedAt` only exists once the entry has synced, so
   an offline retro-close reads as retro only after the drain. The wire payload is built field by
   field in `outbox.ts`, so nothing extra is sent to the server.
2. **`src/nav/__tests__/panelShell.test.tsx`**, one assertion, caused by this ticket's new label.
3. **`src/ui/popHost.tsx`**, additive hook, no behaviour change for existing callers.

## Fidelity note the wave reconciler must apply (1 move, not a rebuild)

The prototype puts the label row + dock **between the header and the "Overview" label** (lines
336–352), with the past-day cards right below it (355–429), and it hides the today-only zones while
a past day is up (`todayOn` gates the hero, Overview and the timeline). The ticket restricted this
builder to DayPanel's marked APP-099 mount region, which sits **after** the "Your day" zone label, so
the block is mounted there. To reach full fidelity, move these two lines in `src/day/DayPanel.tsx`
up to just under `<SwipeHint />` and wrap the Overview/timeline zones in `selectedDate === dayKey()`:

```tsx
<DayDock />
{selectedDate !== dayKey() && <PastDay date={selectedDate} />}
```

## Deviations (all deliberate)

| Asked | Built | Why |
|---|---|---|
| lazy range hydration via `GET /entries` for unseen months | **not built** | the contract's `listEntries` takes a single `date` — a month is 30 round-trips. Statuses come from local SQLite (PLAN R1). Upgrade path noted in `statuses.ts`: add a range query to the API, then fetch once per month keyed in kv. |
| calendar month paging | current month only | the prototype has none, and the dock covers the last 10 days |
| past-day "rest day" branch | a workout record with `state: "skipped"` | there is no rest-day record type in the model; a recorded skip is exactly that claim |
| retro row wording | `pastDay.rows.closedLater` bullet ("closed later, by you") | keeps the recorded card's title stable ("Closed — as planned") while still distinguishing the two closes |
| today's dock/calendar dot | no dot, no ring | the day isn't over — reporting a status on it would be a verdict Vita has no business making |

## Gates

- `npx tsc --noEmit` — **clean for every file in this ticket's scope** (remaining errors are the
  concurrent timeline/trends builders' in-flight files).
- `npx jest src/day` — my suites green; `dayTravel` 10 tests, `dock` 5, plus APP-094/097's.
- Full suite for the record: **66/68 suites, 455/462** — the only failures are
  `src/day/timeline/__tests__/timeline.test.tsx` (APP-098, in flight: `itemRows` swap lens returns
  the base name), which this ticket does not touch.

## Device-verify list

1. Drag the dock: magnifier feel, one haptic per dot, tooltip legibility, and the new dot colours —
   green/amber/ring at 7px, especially the ring's contrast on the cream canvas.
2. Calendar button → sheet: does it anchor to the SCREEN (the portal) and not to the scrolled
   content? Grid density on the Samsung; 42px cells with 34px minimum hit target.
3. A real past day: retro-close → toast → Undo inside the 3.6s window → the day goes quiet again.
4. A day closed live vs a day retro-closed **after a sync** — the second must show "closed later, by
   you"; the first must not.
5. "Log Leg day" on a past day → the muscle map replaces the chips; tap a muscle chip → the sheet
   opens over the screen (portal again).
