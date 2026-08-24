# v4.2 adversarial-review fix pass (app)

Session 24. Findings from the app review of the v4.2 manual builders, fixed on the main tree
(backend fixes ran in parallel in `backend/`). Adjudicated non-findings — `exerciseLabel`'s
hardcoded `min`/`×`, `ImportProgramSheet` chrome, `CountChips` radius — deliberately untouched.

## MAJOR-1 — an estimate could land on the wrong food

`estimate()` snapshotted the `k == null` items as a **flat, positional** list, awaited ~1.5s+,
then merged the answer back by walking that same order. Nothing held the screen still: the
review screen's per-meal *edit* link and the shell's Back both stayed live, so an add/remove
mid-flight shifted the null order and every following estimate landed one row off — marked `~`,
looking authoritative.

Both belts, as briefed:

1. **The list is held still.** `back()` returns early while `busy`; `onEditMeal` does the same
   and the link greys out (`colors.disabled`) — the same shape `KcalCell` already used for the
   inline editor.
2. **The merge is key-safe.** `emptyItems` → **`emptySlots`**, which carries `{ mi, ii, item }`;
   `mergeEstimates(meals, slots, values)` writes a value only where the slot's item is *still*
   there, *still* empty and *still* the same name. Anything that moved is dropped silently — an
   estimate on the wrong food is worse than no estimate. Criterion 11 (a typed number is never
   overwritten) is now an explicit check as well as structural.

Proof: three new pure tests in `draft.test.ts` — an item inserted ahead of the snapshot, an item
removed mid-flight, a number typed mid-flight — plus a route test that presses Back and *edit*
while "Working through the list…" is up and shows both are inert (and live again after).

## MAJOR-2 — the replace warning was missing (CEO Round 16 #2, binding)

The PDF row warns; the "Build it here" rows did not, though building replaces the plan/program
exactly the same way.

- `build.eatingSheet.hereSub`: "meal by meal — replaces the plan you have now"
- `build.trainingSheet.hereSub`: "session by session — replaces your current program"

Criterion 13 stays clean (the copy test greps values, it pins no exact string; it still passes).

## MAJOR-3 — free-text meal time vs the contract pattern

`PlanMeal.time` is `^([01][0-9]|2[0-3]):[0-5][0-9]$`; the builder's time field is free text, so
"7:00" or a stray space would have been rejected at POST. New `wireTime()` in `food/draft.ts`
strips whitespace and pads a single-digit hour; anything that is still not a time of day is
**omitted** — `PlanMeal` requires only `name` + `items` (contract v0.9.0), so a meal with no time
is legal and a wrong time is not. `"7:00"→"07:00"`, `"  12:30 "→"12:30"`, `"24:00"`/`"12:60"`/
`"morning"`/`""` → no `time` key at all.

## MINOR-4 / MINOR-5 — `build-program` caught up with `build-plan`

`finish()` gets the `savedRef` double-tap guard (no duplicate program version) and both `finish`
and `back` get the `canGoBack()` fallback (`/day` and `/library` respectively). The finish test
now presses the button twice and asserts one save, one navigation.

## MINOR-7 — decimal comma

A PT-BR keyboard's decimal key is a comma and `Number("1,5")` is `NaN`, which silently dropped
quantity / sets / reps / minutes / day-kcal. One shared `numOf()` in `src/build/parts.tsx` (next
to `skel`, the other pure helper both builders share) is now the single seam: `MealsPhase`'s
quantity, `train/draft.ts`'s `num`, and `saveEdit`'s kcal (same keyboard, same field class).

## MINOR-8 — dead i18n keys

`build.program.dayKcalEstimated` and `dayKcalNone` deleted (no reader anywhere).

## Files

`app/(main)/build-plan.tsx` · `app/(main)/build-program.tsx` · `src/build/parts.tsx` ·
`src/build/food/draft.ts` · `src/build/food/MealsPhase.tsx` · `src/build/food/ReviewPhase.tsx` ·
`src/build/train/draft.ts` · `src/i18n/locales/en.json` · tests: `food/__tests__/draft.test.ts`,
`food/__tests__/build-plan.test.tsx`, `train/__tests__/draft.test.ts`,
`train/__tests__/build-program.test.tsx`

## Gates

`npx tsc --noEmit` → **0** · `npx jest` → 75 suites, **593 passed / 1 skipped** (baseline 584 + 9).

## Known ceilings (ponytail)

- The estimate pass blocks Back for its ~1.5s floor rather than cancelling in flight. Unmounting
  is still safe (`mounted` ref, criterion 12); a cancel token buys nothing a user would feel.
- `numOf` swaps the FIRST comma only. "1.234,5" (PT-BR thousands) is still not a number here —
  no field in either builder takes a value where a thousands separator is plausible.
