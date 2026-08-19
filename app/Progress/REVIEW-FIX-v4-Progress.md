# REVIEW-FIX-v4 — adversarial-review fix pass

**Source:** `docs/reviews/2026-08-19-v4-app-review.md` (15 findings: 2 critical, 5 major, 8 minor).
**Scope:** `app/services/vita-app/`. No git (orchestrator commits).

**Gates (orchestrator-verifiable):** `npx tsc --noEmit` → **0** · `npx jest --silent` → **60 suites,
454 passed / 1 skipped (455)** — baseline was 57 suites / 427 · `npx expo export --platform android`
→ **OK** (5.2 MB android bundle).

The one skipped test is deliberate: `retro-tz.test.ts` runs the zone-dependent half of the C2
regression in whichever direction the runner's UTC offset makes real, and skips the other.

---

## C1 · CRITICAL — mount-time hydration had no call site — **FIXED**

**Root cause.** The APP-108 sweep deleted `src/tabs/Home.tsx`, the only caller of `syncPlan`,
`syncProgram`, `syncVacation` and `restoreLog`. Nothing replaced it.

**Fix.** New `src/db/bootstrap.ts` → `startAppSync()`: `syncPlan().then(logChanged)` →
`syncProgram` → `syncVacation` → `refreshHealthConnect` → `restoreLog(api)`, all fire-and-forget
(the old Home order, verified against `git show 188f135:./src/tabs/Home.tsx`). Hooked from
`app/(main)/_layout.tsx` next to `startReconnectDrain`/`startDayClose`, **gated on `authed`** so it
cannot fire before the bearer is in memory (APP-061's 401-backoff trap) and so it re-runs on a fresh
sign-in. `restoreLog` drains the outbox itself, so nothing here duplicates that.

`refreshHealthConnect` was the same deletion loss (Home called it, nothing else outside the
Integrations connect flow does) and is one line — folded in rather than left for a second round.

**Test:** `src/db/__tests__/bootstrap.test.ts` — all five hydrations called; a rejecting one never
escapes.

## C2 · CRITICAL — `isRetro` compared UTC days — **FIXED**

**Root cause.** `src/day/state.ts:35` sliced two ISO strings to 10 chars. `rec.at` is a *local*
wall-clock slot serialised with `toISOString()`; `rec.loggedAt` is the server's *UTC* receive time.

**Fix.** Both sides now go through `dayKey(new Date(…))` — the codebase's own local-day convention
(`src/day/record.ts:105`). One line.

**Test:** `src/day/__tests__/retro-tz.test.ts` (new) — same-evening close is not retro, next-morning
close is, an unsynced record derives nothing, plus the two zone-crossing cases (west-of-UTC late
evening → not retro; east-of-UTC after-midnight → retro). The pre-existing assertion in
`day.test.ts` was rewritten: it hard-coded `…T22:00:00.000Z ⇒ false`, which **encoded the bug** — in
a UTC+2 runner that instant is 00:00 local the next day. It now builds its instants from local wall
clocks, so it holds in every zone.

> Deliberately different from the brief: the brief asked for the "jest TZ trick"
> (`process.env.TZ = "America/Sao_Paulo"`). **It does not work here** — jest's VM sandbox resolves
> the local zone before any test file body runs; verified with a throwaway probe under both the
> default and `@jest-environment node`. The test instead *derives* both failure directions from the
> running zone's offset, which is strictly stronger than pinning one city: it asserts the property in
> UTC−3, in UTC+2 and on a UTC CI box alike.

## M1 · MAJOR — the meal card rendered the plan, never the record — **FIXED**

**Root cause.** `MealNode` took the `record` prop but used it only in `restore()`; every number came
from `composeItems(meal, overlay)` — and `src/capture/delta.ts` deliberately never writes the
overlay. So a captured swap was invisible, the badge disagreed with the hero/MacrosCard/Trends, and
any portion tap called `write("adjusted")` → `buildMealRecord(…, overlay)`, silently rebuilding the
record **from the plan** and putting the white rice back.

**Fix.** Two rendering modes in `MealNode.tsx`:
- new exported `recordRows(rec, meal)` maps the record's own items to `ItemRowData`, synthesising a
  `PlanItem` lens (`nutritionPerUnit = totals ÷ qty`) so the shared row/PortionPop rendering is
  untouched, and marking `swapped` by comparing the item's name against the plan item its
  `replacesItemId` points at — which is what makes the captured swap visible at all;
- `rows` / `kcal` / `oi` read the record when there is one (a `skipped` record has no items, so the
  card still lists the plan rows while every number reads 0 — the honest reading of the strike-through
  card);
- new `writeRecordItems(items, toast)` re-records **from the record's own items**. Portion changes on
  a recorded meal now hold the live quantity in `sel.qty` and write **once, on close** (one undoable
  action, as the file's own comment already promised); item-skip removes that item from the record.
  Pre-record behaviour is byte-identical: the overlay is still the store, still written live so the
  pop's daily-totals card tracks the slider.
- Option-pick on a recorded meal deliberately still re-derives from the plan — the user is explicitly
  choosing a different *plan* composition, so that is the intended semantics, not the bug.

`portion` bounds are not carried into the synthetic lens on purpose: the plan item's bounds live in
the plan item's unit space and a swapped item lives in another; `portionRange(qty)` is always
coherent with the number on screen (marked in the doc comment).

**Tests** (`src/day/timeline/__tests__/timeline.test.tsx`): `recordRows` unit; the card shows 277
kcal + "Sweet potato" + the SWAPPED badge while the plan still says Rice/300; and skipping a second
item through PortionPop leaves the captured swap intact instead of rebuilding "Rice".

## M2 · MAJOR — stale `skip`/`swap`/`option` re-bound after a plan re-import — **FIXED**

**Root cause.** Only `overlay.qty` was ever cleaned. Plan ids are positional and reassigned on every
POST (contract 0.8.0), so a surviving `skip["it-7"]` re-bound to a different food and got written
into a permanent record at close-the-day.

**Fix** (`src/db/plan.ts`):
- `clearPortions()` now resets the **whole** overlay (`emptyOverlay()`), so `savePlan` /
  `adoptServerPlan` — the local re-import paths — drop all four maps;
- `pruneOverlayToDoc` prunes all four maps (`option` by meal id, `qty`/`skip`/`swap` by item id);
- new `planBinding(doc)` — the id→name pairs the overlay's keys bind to. `syncPlan` compares the
  cached doc's binding to the incoming one and **clears the whole overlay when it differs**. This is
  the case pruning-by-id structurally cannot catch: after a re-import elsewhere the ids still *exist*,
  so a prune keeps every one of them, now pointing at different foods.
- `updatePlan` additionally runs the prune, so a doc edit that removes an item drops its
  `skip`/`swap`/`option` too (the A5 prune only ever touched `qty`).

> Deliberately different from the brief: the brief suggested storing a `planVersion` alongside the
> overlay. `EatingPlanDraft` carries **no version/id field** (checked `types.gen.ts:1928`), so that
> would have meant inventing device-local version storage and a read-time guard inside
> `dayRecord.ts` — which needs `getCachedPlan`, i.e. a `plan.ts ↔ dayRecord.ts` require cycle, and a
> fingerprint computed on every `getDayRecord`. Comparing the binding at the one place a foreign doc
> is adopted costs nothing and catches the same class.

**Tests** (`src/db/__tests__/portions.test.ts`): local re-import clears all four maps; a re-bound doc
synced down clears `skip` even though `it-2` still exists; an unchanged doc keeps everything; the
prune drops dead `skip`/`swap`/`option` keys, not just `qty`.

## M3 · MAJOR — `openReview()` had no caller (CEO Round-12 #2 lost) — **FIXED**

**Root cause.** The v3 Home banner was the only entry point and went with the sweep.

**Fix.** New `src/day/DayBanners.tsx`, rendered in `DayPanel` right under `<SwipeHint />` and gated to
today. Counter + line + chevron, reusing `cardSurface` — no new visual language, nothing red. Copy
added under `day.banner.*` in `en.json` (the v3 `home.offlineReview*` keys were pruned).

**Test:** `src/day/__tests__/dayBanners.test.tsx` — a probe component subscribed to the same store
proves the press actually opens the sheet, plus the count wording.

## M4 · MAJOR — the day-close notification closed the wrong day — **FIXED**

**Root cause.** `applyDayCloseAction` took `dayKey(now)` — the day of the *tap*. Acted on at 07:30
the next morning it closed the new day and recorded breakfast, a meal nobody confirmed.

**Fix.** `PlannedDayClose` gains `date` (set by `plannedDayClose`, sent by the notifier as
`data: { dayClose: true, date }`). `applyDayCloseAction(actionId, date, now)` closes **that** date,
and uses `nowMin = 24*60` when the date is not today — a past day is over, so every meal on it is
due, which is exactly `retroClose`'s rule (R10a). The response handler reads the payload's date and
falls back to today only when a notification carries none.

**Tests** (`src/notify/__tests__/dayClose.test.ts`): the payload names its day; tapping the next
morning closes yesterday and leaves today completely untouched; today's notification still records
only the due meals.

## M5 · MAJOR — `signalExpandMeal` unconsumed — **FIXED**

**Fix.** `Timeline` subscribes with `useExpandedMeal()` and, on a signal, sets `open` to that meal's
key and clears the signal (`signalExpandMeal(null)`) — the clear is what lets the toast's Undo
signal the same meal again.

**Test:** `signalExpandMeal("m-2")` expands Dinner and the store reads back null.

---

## Minors

| # | Status | Fix |
|---|---|---|
| **m1** | fixed | `src/day/selection.ts`: added an `anchor` (the day that was "today" when `selected` was last set) + pure `rollOverToToday(now)` + `startDayRollover()` on AppState `active`, wired in `(main)/_layout.tsx`. A panel sitting on today rolls over; a day the user travelled to stays put. **Test** in `dayTravel.test.tsx`. |
| **m2** | fixed | `weight` added to `isDeterministic` and `sameSlot` (its slot IS the day, and `reconcile409` already listed only that day) in `outbox.ts`, and to `localIdFor` in `restore.ts` (`weight:<date>`, inlined like the check-in case rather than importing `day/weight.ts`). **Test**: a corrected reading that 409s now PATCHes instead of dying as poison. |
| **m3** | fixed | `upsertEntry`'s else-branch queues an op when the row was `synced` **or** `failed`; op is `update` when a `serverId` exists, `create` when it doesn't (a failed create never reached the server, so a PATCH would just 404 back into poison). **Test**: poison-drop → re-record → a real op behind "pending" → syncs. |
| **m4** | fixed | Covered by M3's `DayBanners` — the second banner reads `mealPlanStatus() === "review"` and routes to `/plan-setup` (review phase), with "Not now" → `hideSetupPrompt()`. **Tests** in `dayBanners.test.tsx`. |
| **m5** | fixed | `PastDay.tsx`: `onOpenDay={(offset) => { setSelectedOffset(offset); setMuscle(null); }}`. `dayOffset` is days back from *today* (`muscleData.dayOffsetOf`), which is exactly what the dock speaks. **No dedicated test** — reaching the CTA needs PopHost + a session with non-empty exercises + non-zero intensity, which is far past "cheap"; the one-liner replaces a no-op with an already-tested setter. |
| **m6** | fixed | `CalendarSheet`: the memo now keys on `todayKey` (a string) instead of the default-parameter `Date`, whose identity changed every render. **No dedicated test** — asserting a memo hit is a perf property, not a behavioural one. |
| **m7** | fixed | `restore.ts` uses `INSERT OR IGNORE` and counts via `res.changes`, so two server rows mapping to one `localIdFor` slot can no longer raise a UNIQUE error that escapes `restoreLog` and parks the cursor forever. This needed the **expo-sqlite mock fixed too** — its `runSync` returned `void`, hiding the real `SQLiteRunResult`; it now returns `{ lastInsertRowId, changes }` like the real module. Covered by the existing `restore.test.ts` duplicate-slot cases. |
| **m8** | fixed | Fixed at the **source**, not in the query: `WorkoutNode.commit` records `skipped` when the last exercise is unticked (previously an empty `adjusted`). That is the honest state, and it is the state whose copy already exists in `PastDay`/`recapLine` but which no v4 surface could write — so the review's "related" half closes with the same change. `series.ts` then just excludes `planStatus = 'skipped'` from the session count, which keeps `PastDay`'s legitimate zero-exercise quick-log (`state: "done"`) counting. **Test** in `timeline.test.tsx` asserts both the record state and `readBuckets("W")`. |

---

## Files touched

**src:** `db/bootstrap.ts` (new) · `db/plan.ts` · `db/entries.ts` · `db/outbox.ts` · `db/restore.ts` ·
`day/state.ts` · `day/selection.ts` · `day/DayBanners.tsx` (new) · `day/DayPanel.tsx` ·
`day/PastDay.tsx` · `day/CalendarSheet.tsx` · `day/timeline/MealNode.tsx` ·
`day/timeline/Timeline.tsx` · `day/timeline/WorkoutNode.tsx` · `notify/dayClose.ts` ·
`notify/notifier.ts` · `trends/series.ts` · `i18n/locales/en.json`
**app:** `(main)/_layout.tsx`
**tests/mocks:** `__mocks__/expo-sqlite.ts` · `db/__tests__/bootstrap.test.ts` (new) ·
`day/__tests__/retro-tz.test.ts` (new) · `day/__tests__/dayBanners.test.tsx` (new) ·
`db/__tests__/portions.test.ts` · `db/__tests__/outbox.test.ts` · `day/__tests__/day.test.ts` ·
`day/__tests__/dayTravel.test.tsx` · `day/timeline/__tests__/timeline.test.tsx` ·
`notify/__tests__/dayClose.test.ts`

## Left alone on purpose

- The review's "Checked and clean" list was not touched.
- `WorkoutNode`'s own `onOpenDay` still computes the offset relative to its `date` prop rather than
  today (unlike `PastDay`'s). It is only ever rendered for today (the timeline zone is gated on
  `selectedDate === dayKey()`), so the two agree in practice; changing it would be a speculative fix.
