# Adversarial review — v4 app round (`945c6c8..504a527`)

**Reviewer:** Opus, adversarial pass. **Scope:** `app/services/vita-app/`, waves 0–5.
**Method:** read the code, traced concrete flows against `docs/v4/PLAN.md` (R1–R10) and
`docs/v4/README.md`. Scoped jest run for baseline only (`src/day src/capture src/db` → 23 suites /
177 tests **green**) — every finding below is an *integration seam the unit tests don't cross*,
which is exactly why 464 green tests didn't catch them.

Findings that the per-ticket ledgers already flag as deviations are **excluded**. Everything here is
unflagged.

---

## C1 · CRITICAL — the app's entire mount-time hydration was deleted with `src/tabs/Home.tsx`

**Files:** `app/_layout.tsx:39-46` · `app/(main)/_layout.tsx:14-22` · orphaned:
`src/db/restore.ts:92` · `src/db/plan.ts:271,282` · `src/db/vacation.ts:117`

The APP-108 deletion sweep removed `src/tabs/Home.tsx`. That file held the **only** call sites of
four launch-time hydrations (verified with `git show 188f135:./src/tabs/Home.tsx` lines 426–429, and
by the APP-111 ledger which names `src/tabs/Home.tsx` as its one-line wiring). Nothing replaced them:

```
$ grep -rn "restoreLog\|syncPlan\|syncProgram\|syncVacation" src app --include=*.ts --include=*.tsx | grep -v __tests__
src/db/restore.ts:92:export async function restoreLog(...)          ← definition only
src/db/plan.ts:271:export async function syncPlan(...)              ← + ONE caller: plan-setup.tsx:149
src/db/plan.ts:282:export async function syncProgram(...)           ← definition only
src/db/vacation.ts:117:export async function syncVacation(...)      ← definition only
```

`app/(main)/day.tsx|library.tsx|trends.tsx` are `return null` placeholders; `PanelShell`,
`DayPanel`, `LibraryPanel` and `TrendsPanel` have no mount effects that sync anything.

**Concrete failures, all on the CEO's next clean install:**

| Scenario | Actual result |
|---|---|
| Install the new APK, sign in. Plan + program already on the server. | `getCachedPlan()` → `null` forever. Timeline empty, no meals, no workout node, hero `planKcal` 0, PastDay says "plan unknown", the day-close notification is suppressed (`plannedDayClose` returns null on `meals.length === 0`). The app looks brand-new. |
| APP-111 "silent 12-month log restore" | **Never runs.** The whole ticket is dead code. |
| Import a PDF, background the app during the ~3 min parse (`plan-setup.tsx:113-164` cancels its poll on unmount) | The server finishes and stores the plan; the app never adopts it and there is no other `syncPlan` to pick it up. The import is invisible until the user re-imports. This is the v3 money-path regression. |
| Edit the plan/program offline (`updatePlan` → `pushPlan()` fails → doc stays `dirty`) | The re-push only happens inside `syncPlan`/`syncProgram`. Never called ⇒ the edit never reaches the server. |
| Cold start during an active vacation | `setVacationAccent()` is only called from `persist()` and `syncVacation()`. The global accent stays terracotta instead of `#3E8FA3` until the user re-opens the vacation sheet. |

**Fix shape:** one block next to `startReconnectDrain`/`startDayClose` in `app/(main)/_layout.tsx`
(or in the existing `loadSession().finally` in `app/_layout.tsx:42`, which already owns the
"session first, then network" ordering):
`syncPlan().then(logChanged)`, `syncProgram().then(logChanged)`, `syncVacation().then(logChanged)`,
`void restoreLog(api).catch(() => {})`.

---

## C2 · CRITICAL — `isRetro` compares UTC dates: every evening close in Brazil reads as "closed later, by you"

**File:** `src/day/state.ts:35-36`

```ts
export const isRetro = (rec) => rec.loggedAt != null && rec.loggedAt.slice(0, 10) > rec.at.slice(0, 10);
```

`rec.at` comes from `atMinutes()` (`record.ts:211-216`): a **local** wall-clock slot converted with
`toISOString()`. `rec.loggedAt` is the server's UTC `updatedAt` (`entries.ts:229-235`). Slicing both
to 10 chars compares **UTC calendar days**, not local ones — so any local-evening write in a
negative-UTC-offset zone crosses the UTC midnight and reads as a different day.

Verified numerically at `TZ=America/Sao_Paulo` (UTC−3, the CEO's zone):

```
occurredAt (breakfast 08:00 local, 19 Aug) = 2026-08-19T11:00:00.000Z -> "2026-08-19"
loggedAt   (closed 21:30 local, 19 Aug)    = 2026-08-20T00:30:00.000Z -> "2026-08-20"
isRetro? true            ← WRONG: closed the same evening
dinner slot 20:00 local, closed 21:30 local -> also true
```

**Trigger frequency is high, not edge:** PLAN R7 puts the day-close notification at
`recapStartHour` = 20:00. Acting on it any time after ~21:00 local trips this for **every** record
written in that batch.

**Consequences:**
- `PastDay` (`PastDay.tsx:63`) appends the "closed later, by you" row — a false claim about how the
  record was made, in the one place the product is explicitly making an honesty claim.
- `TrendsPanel.dayLines` (`TrendsPanel.tsx:146`) returns `[t("trends.detail.retro")]` **instead of**
  the real recap lines — the week-bar detail card silently loses its content.
- The inverse also exists: in positive-offset zones a genuine retro-close near local midnight can
  read as same-day.

**Fix shape:** compare local day keys — `dayKey(new Date(rec.loggedAt)) > dayKey(new Date(rec.at))`
(`dayKey` already exists in `record.ts:105`).

---

## M1 · MAJOR — the timeline meal card renders the plan, never the record: capture deltas disagree with the day's numbers, and re-opening the card discards them

**File:** `src/day/timeline/MealNode.tsx:135-137, 249, 255, 359-402` (vs `src/capture/delta.ts:1-13`)

`delta.ts`'s own header states the invariant:

> "Recording a delta writes ONE self-describing meal record: the draft's own items, byte for byte,
> so the card's '~679 kcal' and the day's number can never disagree. The day overlay is
> deliberately NOT touched."

`MealNode` receives the `record` prop but uses it **only** inside `restore()` (line 143-146). Every
rendered number comes from `composeItems(meal, overlay)` / `itemRows(meal, overlay)` — the plan
composition under the *overlay*, which the capture path deliberately never writes.

**Trace.** Plan lunch `m-3` = 702 kcal. Voice capture "I had sweet potato instead of the white
rice" → backend returns the full composition, `planDelta` computes `kcalDelta −23`, the sheet shows
"white rice → sweet potato · −23 kcal", user taps **Record it**:

| Surface | Shows |
|---|---|
| `DayPanel` hero (`DayPanel.tsx:86` reduces `day.meals[].totals`) | 679 kcal ✓ |
| `MacrosCard` / `MacrosSheet` (same source) | 679 ✓ |
| Trends energy bar (`series.ts:79` sums `$.totals.kcal`) | 679 ✓ |
| **Timeline lunch card badge** (`MealNode.tsx:137,255`) | **~702** ✗ |
| **Timeline lunch card expanded rows** | **"white rice"** — the swap is invisible ✗ |

Then the second-order data loss: the card carries the amber `ADJUSTED` tag (state comes from the
record) but shows plan content. Tapping any item row → PortionPop → `closePortion()`
(`MealNode.tsx:197-212`) sees `state === "adjusted"` and calls `write("adjusted")`, i.e.
`buildMealRecord(date, meal, "adjusted", overlay)` — which rebuilds the record **from the plan
composition**. The captured sweet potato is silently overwritten back to white rice. Same for
`patchOverlay` (line 166-176) on an option pick or an item skip.

The `skipped` case has the same shape at lower stakes: a skipped meal still shows its full plan
kcal badge (`~702`) while contributing 0 to every other surface.

**Fix shape:** when `record` is present and `record.planOptionIndex`/items don't derive from the
overlay, render `record.items` / `record.totals`; and make the "adjust an already-recorded meal"
path start from the record's items rather than re-deriving from the plan.

---

## M2 · MAJOR — the day overlay's `skip` / `swap` / `option` survive a plan re-import and re-bind to different foods

**Files:** `src/db/plan.ts:84-86` (`clearPortions`), `:93-105` (`pruneOverlayToDoc`),
`:172-200` (`savePlan` / `adoptServerPlan`), `src/plan/compute.ts:197-216` (`pruneOverlayAfterEdit`)

`DayOverlay` has four maps (`record.ts:72-81`): `option`, `qty`, `skip`, `swap`. **Only `qty` is
ever cleaned.** `clearPortions()` is `setOverlay(dayKey(), { qty: {} })`; `pruneOverlayToDoc` and
`pruneOverlayAfterEdit` both operate on `getPortions()` = `overlay.qty`.

Plan ids are **positional and reassigned on every POST** — contract 0.8.0: *"m-1…m-N in document
order, assigned when a plan version is saved… POST assigns fresh ones"*, same for `it-1…it-N`
(`types.gen.ts:1947,1963`).

**Trace.** Today, before lunch: the user opens lunch, taps "banana" → *didn't have it today* ⇒
`overlay.skip["it-7"] = true`. Later the same day the CEO re-imports the plan (PLAN §5 Q6 = yes,
"one plan re-import after deploy"). The new document's `it-7` is **chicken breast**. Now:

- `composeItems()` (`record.ts:161`) drops chicken breast from every lunch composition for the rest
  of the day;
- the meal card's kcal badge is short by the chicken;
- closing the day (`closeDay` → `buildMealRecord` → `composeItems`) **writes that wrong composition
  into a permanent, self-describing entry**, and the record is the thing v4 says can never be
  rewritten by a later plan change.

A stale `swap["it-7"]` is worse — it prices an unrelated food through the equivalence lens
(`composeItems` line 163). A stale `option["m-3"]` picks a wrong option index on a different meal.

**Fix shape:** `clearPortions()` on a new plan version should reset the **whole** overlay for the
day (`setOverlay(date, emptyOverlay())`), and `pruneOverlayToDoc` should prune `skip`/`swap` by item
id and `option` by meal id, not just `qty`.

---

## M3 · MAJOR — the offline-review affordance is unreachable (CEO Round-12 #2 lost)

**Files:** `src/review/ReviewSheet.tsx:26` (`openReview`) · `src/db/entries.ts:243-253`

```
$ grep -rn "openReview" src app --include=*.ts --include=*.tsx | grep -v __tests__
src/review/ReviewSheet.tsx:26:export const openReview = (): void => {   ← definition only
```

`countNeedsReview()` likewise has zero non-test references. `<ReviewSheet />` is still mounted in
`app/(main)/_layout.tsx:53` but nothing can open it — the v3 Home banner that did was deleted by the
sweep with no v4 replacement.

**Trace.** Capture a meal offline → `enqueueInterpretation` → reconnect → `interpretPending`
(`outbox.ts:57`) calls `addLocalEntry(draft, /*needsReview*/ true)`. The entry is written and
counted in the day's totals **without ever passing a confirm sheet**, the banner that gave that
affordance back no longer exists, and `needsReview = 1` is never cleared. The CEO's Round-12
requirement ("an entry Vita added on your behalf must be reviewable") is silently gone.

---

## M4 · MAJOR — the day-close notification closes the *wrong day* when acted on the next morning

**File:** `src/notify/dayClose.ts:91-104`

```ts
export function applyDayCloseAction(actionId: string, now: Date = new Date()): void {
  const date = dayKey(now);                                  // ← the day of the TAP
  ...
  applyClose(closeDay(getDayRecord(date), meals, now.getHours() * 60 + now.getMinutes()));
```

A local notification stays on the lock screen until dismissed. Tapping **"Close as planned"** at
07:30 the next morning:

- closes **today** (the new day), not the day the notification was about;
- `closeDay` records every meal already due at 07:30 — i.e. breakfast — as `done`, **a meal the user
  has not confirmed happened**. That is precisely the "Vita never assumes" rule the notification's
  own copy makes (`notify.dayClose.footer`);
- yesterday stays unrecorded, so the user's intent is lost too.

The notification content is built for a specific date but the action carries no date with it.

**Fix shape:** put the date in the notification's `data` (`notifier.ts:148` already sends
`data: { dayClose: true }`) and have `applyDayCloseAction` close *that* date; refuse if it isn't the
day the notification was scheduled for.

---

## M5 · MAJOR — `signalExpandMeal` is never consumed: recording a delta does not open the meal

**File:** `src/capture/CaptureContext.tsx:61-77, 200, 210`

```
$ grep -rn "useExpandedMeal\|getExpandedMeal" src app --include=*.ts --include=*.tsx | grep -v __tests__
  (only src/capture/CaptureContext.tsx itself)
```

`Timeline` (`Timeline.tsx:153`) drives expansion from a local `useState<string | null>` and never
subscribes to the store. APP-104's documented behaviour — *"Recording a delta auto-expands the meal
it touched, so the user lands on what just changed"* — does not happen, in either direction
(record or undo). Combined with **M1**, the user records a swap and gets no visible confirmation
anywhere on the timeline.

---

## m1 · MINOR — `selection.ts` freezes "today" at module load

**File:** `src/day/selection.ts:14`

```ts
let selected: string = dayKey();   // evaluated once, at import time
```

Leave the app open overnight (backgrounded, JS context alive). Next morning `selected` is still
yesterday's key while `dayKey()` is today's, so:

- `DayPanel.tsx:145` renders `<PastDay date={yesterday} />` and `:149` hides every today-only zone
  (Overview, timeline) — the user opens the app to a "past day" they never navigated to;
- `isSelectedDayToday()` is false ⇒ the capture pill disappears (`CapturePill` gates on it).

**Fix shape:** an AppState `active` handler (or the existing `logChanged` tick) that resets
`selected` to `dayKey()` when the stored value is no longer today and the user hadn't travelled.

## m2 · MINOR — `weight` entries are missing from the deterministic-id reconcile paths

**Files:** `src/db/outbox.ts:68-80` (`isDeterministic`, `sameSlot`) · `src/db/restore.ts:42-49`
(`localIdFor`)

`weight.ts:26` writes under the deterministic id `weight:<date>` (one reading per day, corrections
PATCH the same row) — but `isDeterministic()` only recognises `checkin`, `meal+planMealId` and
`workout+planDay`.

- Lost-response create + a corrected reading ⇒ the replayed POST carries the same Idempotency-Key
  with different content ⇒ 409 ⇒ **not** routed to `reconcile409` ⇒ `isPoison(409)` is true ⇒
  `markFailed`. The correction is silently dropped (this is exactly audit-1.3, re-opened for the new
  entry type).
- `localIdFor` doesn't map weight either, so a restored weight row lands under the server uuid while
  `todaysWeight()` looks up `weight:<date>` — a duplicate slot for that day.

## m3 · MINOR — `upsertEntry` on a `failed` row leaves it un-queued forever

**File:** `src/db/entries.ts:171-182`

The `else` branch sets `syncState = 'pending'` unconditionally but only enqueues an op when
`existing.syncState === 'synced' && !queued`. A row previously marked `failed` (poison drop) that is
re-recorded goes back to `pending` with **nothing in the outbox** — permanently "waiting to sync"
with no op behind it, which is the exact lie audit 1.8 introduced `failed` to stop.

## m4 · MINOR — `mealPlanStatus()` is orphaned: the "your meal plan is in" surface is gone

`src/db/plan.ts:114` has no non-test caller. The v3 async-import safety net (a Home banner for a
user who backgrounded the app during the 3-minute parse — session-19 §7.3) was deleted with
`Home.tsx` and nothing in Library or Day replaced it. Compounds C1's third row.

## m5 · MINOR — "Open this day →" is a no-op in the past-day muscle sheet

`src/day/PastDay.tsx:103`: `onOpenDay={() => setMuscle(null)}` ignores the offset. The CTA renders
(`MuscleSheet.tsx:107-119` gates on `r.canOpenDay`) and does nothing but close the sheet.

## m6 · MINOR — `CalendarSheet` re-queries the month on every render while open

`src/day/CalendarSheet.tsx:61,74`: `today = new Date()` is a default parameter, so its identity
changes every render and `useMemo(..., [visible, today])` never hits. `monthStatuses(today)` (two
ranged SQL scans + a full map/reduce) runs on every render of the Day panel while the sheet is up.

## m7 · MINOR — `restoreLog` aborts permanently on a duplicate deterministic slot

`src/db/restore.ts:67-81` does a bare `INSERT` — no `OR IGNORE`, no try. Two server rows that map to
one `localIdFor()` key (e.g. a pre-0.8.0 meal and its re-recorded twin) raise a UNIQUE constraint
that escapes `restoreLog`, leaving `restore.done` unset and the cursor parked → the restore retries
and fails identically on every launch. Latent until C1 is fixed and the function actually runs.

## m8 · MINOR — Trends counts an emptied workout as a session

`src/trends/series.ts:81` counts every `workout` entry. `WorkoutNode.toggleExercise`
(`WorkoutNode.tsx:142-147`) can commit `exercises: []` as `adjusted`, and that record still adds 1 to
"N workouts this week" and draws a movement bar. Related: `state.ts:70` / `PastDay.tsx:59,95` render
copy for a `skipped` workout, but **no v4 surface writes one** — the workout node has confirm and
per-exercise toggles only, no skip action (README §3 implies parity with meals).

---

## Checked and clean

- **Copy rules (README §5).** Every occurrence of goal/target/streak/score/missed in
  `src/i18n/locales/en.json` is a sanctioned negation ("never a streak", "not a target",
  "coverage, never a score"). PASS.
- **Dangling i18n keys behind dynamic templates.** All 21 template-key families
  (`timeline.tag.*`, `muscle.name.*`, `library.keeps.row.*`, `notify.dayClose.*`,
  `capture.delta.state.*`, `vacation.duration.*`, `export.section.*`, …) resolve against the pruned
  592-key `en.json`. PASS.
- **R10b — empty-items tolerance.** `sumTotals`, `dayCounters`, `recapLine`, `pastRows`,
  `macroPct` (guards `plan > 0`), `weightPoints`, `recordedAverage`, `readBuckets` all survive a
  zero-item skipped meal and an all-absent range.
- **The `-1` base-option sentinel.** `optionIndexFor` (`record.ts:141-144`) reads `options[-1]` as
  `undefined` ⇒ base, and `-1 ?? usualOptionIndex` correctly *overrides* a persisted usual. Correct
  in `composeItems`, `itemRows`, `buildMealRecord` and the chip's `on` test.
- **Gesture arbitration.** `tabsPagerRef` is created by `PanelShell`'s pan (`withRef`) and consumed
  by `ScrubOverlay` and `DockDatePicker` via `blocksExternalGesture`; all three panels are always
  mounted (no mid-gesture remount, the session-6 class); `enabled(onPanel && !sheetOpen)` kills the
  pan under a sheet. Chain is intact.
- **Movement chart fallback.** `WorkoutDetail.kcal` is never written by any v4 path, but
  `TrendsPanel.tsx:201` detects the all-zero series and falls back to session counts — a graceful
  degrade, not a bug.
- **`closeDay` / `retroClose` are one representation** (R10a) and neither overwrites an existing
  record (`close.ts:21`).
- **`applyDelta`/`revertDelta` round-trip** restores the previous `MealRecord` byte-for-byte and
  removes the entry when the meal was previously unrecorded.
- **`hydrateDay` dirty protection** and `invalidateDay` on every `entries.ts` write path — the
  derived `day_record` cache cannot go stale.
- **`settingsSync` hydrate-before-push** (`settingsSync.ts:158-182`): the subscribe-before-await, the
  `changedBeforeHydrate` flag and the `isDirty || localEdit ? null : …` baseline are all correct;
  an offline GET genuinely leaves the module unhydrated.
- **Baseline gates:** `npx jest src/day src/capture src/db` → 23 suites / 177 tests green.

---

## Ranked

| # | Sev | One line |
|---|---|---|
| C1 | critical | `restoreLog` / `syncPlan` / `syncProgram` / `syncVacation` have no call site — the sweep deleted `Home.tsx`. Reinstall restores nothing; the server's plan never loads. |
| C2 | critical | `isRetro` compares UTC days — closing after ~21:00 local (UTC−3) falsely stamps the day "closed later, by you" and blanks the Trends week detail. |
| M1 | major | `MealNode` renders the plan, not the record: a capture delta's kcal/items disagree with the hero, and adjusting the card overwrites the captured swap. |
| M2 | major | Only `overlay.qty` is cleared on a plan re-import; stale `skip`/`swap`/`option` re-bind to different foods and get written into permanent records. |
| M3 | major | `openReview()` has no caller — offline auto-added entries can never be reviewed (CEO Round-12 #2 lost). |
| M4 | major | The day-close notification acted on the next morning closes the *new* day and records unconfirmed meals. |
| M5 | major | `signalExpandMeal` unconsumed — recording a delta gives no timeline feedback at all. |
| m1 | minor | `selection.ts` caches "today" at module load; overnight the app opens on a past day with no capture pill. |
| m2 | minor | `weight` missing from `isDeterministic`/`sameSlot`/`localIdFor` — a corrected reading can 409 into poison. |
| m3 | minor | `upsertEntry` on a `failed` row → `pending` with no outbox op, stuck forever. |
| m4 | minor | `mealPlanStatus()` orphaned — no surface tells a backgrounded user the plan arrived. |
| m5 | minor | Past-day muscle sheet's "Open this day →" only closes the sheet. |
| m6 | minor | `CalendarSheet` re-runs `monthStatuses` every render (default-param `new Date()` breaks the memo). |
| m7 | minor | `restoreLog`'s bare INSERT can permanently wedge the restore on a duplicate slot. |
| m8 | minor | Trends counts a zero-exercise workout as a session; no v4 surface can mark a workout skipped though the copy exists. |
