# APP-134 + APP-135 — v4.2 Wave 2 (estimate marks + the day's kcal)

Session 24, build round. Opus builder, app team. Backend ran BE-061/063/065 in parallel;
nothing under `backend/` was touched here.

## APP-134 — the estimate mark persists on plan surfaces (PLAN R1)

### The real gap, found before writing anything

The ticket reads "render `kcalEstimated` items with `~`". Grepping first showed something
bigger: **nothing in the app read `PlanItem.kcal` at all.** Every plan surface prices an item
through `src/plan/compute.ts` → `effectivePerUnit` → `nutritionPerUnit`, and a hand-built plan
(contract 0.9.0 D2, pass-through with no server math) has **no** `nutritionPerUnit` — only a
total `kcal` per item. A plan built in the new builder would therefore have rendered as `~0`
on every screen, and the estimate mark would have been a mark on a zero.

Fixed once, at the chokepoint:

```ts
const perUnitFromKcal = (item) => { const q = item.quantity ?? 1;
  return item.kcal != null && q > 0 ? { kcal: item.kcal / q } : undefined; };
// effectivePerUnit: item.nutritionPerUnit ?? perUnitFromKcal(item)
```

Macros stay absent — a hand-built item states none and the app invents none. Because the
fallback sits in `effectivePerUnit`, everything downstream works untouched: item rows, meal
totals, `planDailyTotals` / `planBaseTotals`, the portion slider's live recompute and
PortionPop's delta badge.

### Where the `~` mark landed

The `~` glyph itself was already on every plan number in the app. What APP-134 adds is the
finer **estimate ink + dashed base** (`#A66A3F`, handoff §2.4), on the three surfaces that
show a per-ITEM kcal:

| Surface | File | Note |
|---|---|---|
| Eating Plan doc editor, item row | `app/(main)/plan.tsx` | `~{n}` → estimate ink + dashed base when `it.kcalEstimated` |
| Day timeline, expanded meal row | `src/day/timeline/MealNode.tsx` | reads `r.lens.kcalEstimated`; a `recordRows` lens has no flag, so record rows never light up (a record states what was eaten, and the wire carries no flag) |
| Portion pop, item readout | `src/plan/PortionPop.tsx` | `~{kcal}` on `item.kcalEstimated` |

**Totals: no change made, and none needed.** Every plan total in the app already renders a
`~` — `kcalLabel()`, `timeline.kcal`, `library.plan.sub`, `pastDay.empty.planKcal`,
`planSetup.planReadyKcal`. A total containing an estimate is therefore already labelled as an
estimate, which is the constitution's rule and the cheapest honest satisfaction of it. The
ink+dash stays at item level, where the number is also *correctable*.

Surfaces checked and deliberately left alone: `src/library/sections/EatingPlan.tsx` (meal
totals only, already `~`), `app/(main)/plan-setup.tsx` (PDF-import review; shows `meal.kcal`,
already `~`), `src/day/overview/MacrosSheet.tsx` (day records, not plan items),
`src/day/timeline/WorkoutNode.tsx` (program kcal, absent → no line).

### Shared token

`src/ui/tokens.ts` gains `colors.estimateDash` + `estimateBase`:

```ts
export const estimateBase = { borderBottomWidth: 1, borderBottomColor: colors.estimateDash,
                              borderStyle: "dashed" } as const;
```

A **border on a wrapping View**, not `textDecorationLine`: Android ignores
`textDecorationStyle: "dashed"`, and this is the one mark that may not go missing.
`ReviewPhase`'s inline copy of the same three properties converged onto it.

## APP-135 — the training builder's day kcal (CEO Round-16 #4 / D9)

`src/build/train/parts.tsx` gains `DayKcalLine`, mounted in `DayCard` under the muscle map:

- eyebrow **"Calories for this session"**, a quiet numeric `TextInput` in the builder's own
  house style (dashed baseline, exactly like the day-name input), the `kcal` unit, the hint.
- **"Work it out for me"** → `api.estimateWorkoutKcal({ exercises: workoutKcalBody(day) })`.
  `workoutKcalBody` is a new pure helper in `draft.ts` and sends only the **active family's**
  measure (`{name, fam, sets, reps}` or `{name, fam, min}`) — same rule as `toExercise`, for
  the same reason: a `min` left over from a family switch is not what the day is made of.
- busy state is the house `vtBreath` box, 1.5 s **floor** (a slower answer just takes longer).
- estimated → `~` prefix + `#A66A3F` input text + the baseline going amber. Typed → solid ink,
  ordinary dashed baseline, no `~`.
- **empty stays empty**: `toProgramDraft` omits `kcalEstimate`, and `WorkoutNode` already
  renders no line when the field is absent.

**"A typed number is never overwritten" is structural, not a check**: the estimate control only
renders while the field is empty *and* the day has at least one exercise, so a typed number is
never offered to the estimator in the first place. Typing over an estimate clears the new
`BwDay.kcalEst` flag — a corrected estimate is not an estimate.

Typed and estimated both land in `ProgramDay.kcalEstimate`, per CEO decision 4 ("as kcal vão
ser estimadas, tanto pelo usuário quanto pela IA").

**Failure / offline**: there is no on-device fallback, and deliberately so. Food kcal has the
`FKG`/`FKU` table to fall back to; a whole session's energy has nothing comparable, and a
made-up number is worse than none. A throw or timeout shows nothing new and leaves the field
empty and typeable (`ponytail:` comment at the catch).

### Reuse

The quiet estimate button + the `vtBreath` working box were lifted out of the food builder's
`ReviewPhase` into `src/build/parts.tsx` as **`EstimateAction`**, now shared by both builders
instead of existing twice.

## Files

- `src/plan/compute.ts` — `perUnitFromKcal` fallback in `effectivePerUnit`
- `src/ui/tokens.ts` — `colors.estimateDash`, `estimateBase`
- `app/(main)/plan.tsx`, `src/day/timeline/MealNode.tsx`, `src/plan/PortionPop.tsx` — the mark
- `src/build/parts.tsx` — `EstimateAction` (new, shared)
- `src/build/food/ReviewPhase.tsx` — converged onto `estimateBase` + `EstimateAction`
- `src/build/train/draft.ts` — `BwDay.kcalEst`, `workoutKcalBody`
- `src/build/train/parts.tsx` — `DayKcalLine`, `DayCard` props
- `app/(main)/build-program.tsx` — busy state, the estimate call, the never-overwrite patch

## Gates

- `npx tsc --noEmit` → **0**
- `npx jest` → **584 passed / 1 skipped**, 75 suites (baseline 574/1 → **+10**)
  - `src/plan/__tests__/compute.test.ts` +4 (hand-built pricing, portion scaling, meal/day
    sums, nothing-stated case)
  - `src/__tests__/plan-screen.test.tsx` +1 (mixed doc: `~235` inked + dashed, `~156` plain,
    `~391` total)
  - `src/build/train/__tests__/draft.test.ts` +2 (`workoutKcalBody`), `toProgramDraft` case
    extended (typed AND estimated emit `kcalEstimate`; empty/blank omit)
  - `src/build/train/__tests__/build-program.test.tsx` +3 (estimate fills + marks + saves;
    typed survives and hides the control; an empty day offers nothing)

## Deviations / notes for the reviewer

1. **Two i18n keys unused**: `build.program.dayKcalEstimated` (`~{{kcal}}`) and `dayKcalNone`
   (`—`). They assume a tap-to-edit *display cell* like the food builder's `KcalCell`; an
   always-live input has no "—" state and takes the `~` as a sibling glyph. Chosen because the
   display-cell design needs a local `editing` flag that would leak across days (`DayCard`
   does not remount between steps). `en.json` untouched per the brief.
2. **Meal/day totals were not given the ink+dash**, only the pre-existing `~` (rationale
   above). Flagging in case the reviewer wants the finer mark propagated upward.
3. A pre-existing `Each child in a list should have a unique "key" prop` warning from
   `PopHost`/`SheetOverlay` shows in the builder suites. Not introduced here.
