# APP-v4.3 — adversarial-review fix pass (F1–F7)

**Scope:** `app/services/vita-app/`. No git, no APK (orchestrator commits; an emulator drive ran
against the already-built APK in parallel). **F5 (rounding order) untouched — flag-only.**

**Gates (orchestrator-verifiable):** `npx tsc --noEmit` → **0** · `npx jest` → **82 suites,
676 passed / 1 skipped (677)** — baseline was **671 passed / 1 skipped**, so **+5** tests.
(The one skipped test is `retro-tz.test.ts`'s zone-dependent half, as always.)

Every fix below was verified RED first (the fix neutralized in place, the new test failing with the
exact reviewed symptom) and then GREEN.

---

## F1 · MAJOR — pop reopen race stranded an empty `/pop` route — **FIXED**

**Root cause (reviewer's, confirmed).** `mounted` was a module boolean and `PopScreenContent`'s
unmount cleanup closed and cleared *whatever* entry was current. React Navigation keeps a POPPED
screen mounted until its dismissal animation ends, so reopening inside that window puts two `/pop`
screens on the stack: the OLD one's unmount then fired the NEW pop's `close` (card blanks) and left
the route up with `PanelShell` frozen at `pointerEvents: none` — and iOS has no hardware back.

**Fix** (`src/ui/popScreen.tsx`, `src/ui/PopOverlay.tsx`, ~10 lines):
- `mounted` is a **counter** (`isPopScreenOpen()` = `mounted > 0`), so one screen going away while
  another is up still reports `/pop` as open — the owner's `router.back()` path stays correct.
- The entry carries a monotonic **`seq`**, stamped on each closed→open transition. `setPopScreen`
  takes a `fresh` flag for that; `NativePop` passes `!pushed.current`, which IS the transition (its
  `setPopScreen` effect runs before the push effect in the same commit, so the flag is still false
  on the opening render). Keying on `fresh` rather than on the id is deliberate: the id is the
  OWNER's (`useId`), so reopening the same meal's pop is a same-id reopen and an id compare would
  miss exactly the case the CEO hits.
- `PopScreenContent` captures `current?.seq` at mount; its cleanup **no-ops when the seq differs**.

**Test:** `src/ui/__tests__/popScreen.test.tsx` — "a pop reopened during the old screen's fade-out
survives that screen's unmount": open A → reopen B (same id) → mount screen 2 → unmount screen 1 →
`calls` is `[]` and `isPopScreenOpen()` stays true; B still renders; B's own unmount then closes it.
Without the guard: `calls` = `["closeB"]`.

## F2 · MEDIUM — edit-plan Save blocked on the network — **FIXED**

`app/(main)/edit-plan.tsx` awaited `updatePlan(...)` behind a `saving` state, so Save sat on the PUT
(and dimmed to .6) on a slow link for a write that was already done: `db/plan.updatePlan` does the
cache write, the dirty flag and both overlay prunes **synchronously before its first await**.

**Fix:** `void updatePlan(toSaveDoc(...)).then(logChanged)` + a `saved` ref as the double-tap guard —
edit-program's exact pattern. `saving` state and its opacity gone; the `setOverlay(dayKey(),
{ qty: {} })` still lands after (also synchronous, so it still wins over `updatePlan`'s own prune).

**Test:** `src/__tests__/edit-plan.screen.test.tsx` — "Save doesn't wait for the PUT": `api.updatePlan`
mocked to a promise that never settles; `back()` is called anyway, the cache already holds quantity
150 and today's `qty` overlay is cleared. The three pre-existing save tests still pass unchanged.

## F3 · MEDIUM — rename / time-move stripped the meal's stated kcal — **FIXED**

`src/edit/plan/draft.ts`: the strip decision compared `projMeal` (name + time + items) against the
meal's snapshot, so renaming "Lunch" → "Almoço" or moving it half an hour silently dropped the PDF's
transcribed `kcal` and downgraded the meal to a computed sum.

**Fix:** new `projItems` (items only) — `projMeal` now composes it, `fromDoc` snapshots it and
`saveMeal` decides on it. Composition change ⇒ strip; pure rename/time-move ⇒ keep `src.kcal`.

**Test:** `src/edit/plan/__tests__/draft.test.ts` — both directions: rename + time move keeps 109
(and the item object identity), a portion edit still strips it.

## F4 · MINOR — session-map chip order — **FIXED**

`src/edit/program/parts.tsx` iterated `MUSCLE_KEYS` (quads-first, the Trends order) while its comment
claimed MGN order. Now a local `CHIP_ORDER` = `ch, bk, sh, ar, tr, co, qu, ha, gl, ca` (handoff §6.5,
`satisfies readonly MuscleKey[]`), comment corrected, `MUSCLE_KEYS` import dropped.

**Test:** `src/edit/program/__tests__/edit-program.test.tsx` — Leg day chips read
Back · Core · Quads · Hamstrings · Glutes · Calves; Upper body reads Chest · Back · Shoulders · Arms ·
Traps. (One `testID="session-chips"` added so the assertion is on the chip row, not on the exercise
rows that repeat the same names.)

## F6 · MINOR — locked ad-lib swap showed "0" kcal — **FIXED**

An ad-lib swap ("a piece of fruit") states no quantity, so `effectivePerUnit` is undefined and the
draft's `per` is 0 — the editor printed a confident `0`. `MealCard`'s kcal cell now renders `—` when
`locked && per === 0`, matching the Day, which prints no number for it either. The model keeps 0
(the meal sum is unchanged).

**Test:** `src/__tests__/edit-plan.screen.test.tsx` — "a locked ad-lib swap shows no number instead
of 0 kcal".

## F7 · MINOR — token unification — **FIXED**

`SOFT_DESTRUCTIVE` lived in both `src/edit/plan/MealCard.tsx` and `src/edit/program/parts.tsx`, its
border was a literal in both, and the inert-block background disagreed by one hex (`colors.track`
`#F0E9DA` in edit-plan vs `INERT_BG` `#F0E9DB` in the training editor).

**Fix:** `src/ui/tokens.ts` gains `colors.softDestructive = { ink, border }` and
`colors.inertBlock = "#F0E9DB"` (the handoff-exact value). Both editors consume them; the three local
consts are deleted, and edit-plan's footer no longer borrows the chart-track colour.

---

## Files touched

- `src/ui/popScreen.tsx`, `src/ui/PopOverlay.tsx` (F1)
- `app/(main)/edit-plan.tsx` (F2, F7)
- `src/edit/plan/draft.ts` (F3), `src/edit/plan/MealCard.tsx` (F6, F7)
- `src/edit/program/parts.tsx` (F4, F7)
- `src/ui/tokens.ts` (F7)
- Tests: `src/ui/__tests__/popScreen.test.tsx`, `src/__tests__/edit-plan.screen.test.tsx`,
  `src/edit/plan/__tests__/draft.test.ts`, `src/edit/program/__tests__/edit-program.test.tsx`
