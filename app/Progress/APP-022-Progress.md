# APP-022 — Eating plan screen with Edit mode

Asana: Vita frontend `1216519867368576` · slice 3 (F4/F5) of `docs/backlog-local-100.md` · **D5**.

## What was built

Full eating-plan screen `app/(main)/plan.tsx`, faithful to the prototype
("Eating plan" + "Portion adjust"), with an **Edit mode where any field is editable**
and **live local recompute** of totals.

- **View mode**: title (plan summary), daily card (kcal planned, protein/carbs/fat bars,
  micro chips), meal cards (name · time · kcal) with item rows (name · qty · kcal).
  "estimate" labeled. Footer hint.
- **Edit mode** (toggle in the shared `EditHeader`): every field is a `EditableText` —
  plan title, meal name, meal time, item name; **quantity via a portion sheet** (the
  prototype's slider) **plus a numeric field** (dual input). Add/remove item, add/remove
  meal. **Totals recompute live** from the working copy as you drag or type — no server
  round-trip per edit (`planDailyTotals`/`mealTotals`/`itemTotals`, pure).
- **Save = whole-plan `PUT /v1/plan`** via `updatePlan(workingDoc)` — the full edited
  doc is sent (backend re-encrypts the whole blob; no field-level patch). Cancel discards.
- **No history UI** this ticket (backend-only; a "previous plans" picker is a later follow-up).
  No goals/scores/streaks.

## Files
New:
- `app/(main)/plan.tsx` — the screen (working-copy edit model via `clone`+`mutate`; portion Modal).
- `src/ui/Slider.tsx` — minimal portion slider (gesture-handler Pan + reanimated; **no
  native slider dep** — works in Expo Go). Pure `clampSlider/quantize/valueFromX/ratioOf` exported for tests.
- `src/ui/EditableText.tsx` — reusable Text⇄TextInput field ("any field editable").
- `src/plan/editor.tsx` — shared `BackButton` + `EditHeader` (Edit ⇄ Cancel/Save), reused by APP-023.
- `src/plan/compute.ts` (from APP-021) — `portionRange` added here.
- `src/plan/__tests__/compute.test.ts`, `src/__tests__/plan-screen.test.tsx`.

Changed: `src/ui/index.ts` (export Slider, EditableText); `src/i18n/locales/en.json` (`plan.*`).

## Recompute model
`item = quantity × nutritionPerUnit`; `meal = Σ items`; `daily = Σ meals`. The portion
slider/numeric field only mutate `quantity`, so the whole tree re-totals from pure functions.

## Tests
- Compute + slider math (pure): itemTotals/mealTotals/planDailyTotals/portionRange, clamp/quantize/value↔ratio.
- Screen: Edit → open portion sheet → set exact qty → **live recompute** asserted (137→411 before save)
  → Confirm → Save fires **one `updatePlan` with the whole doc** (summary present, quantity=3), cache updated.
- Cancel discards (no PUT, cache unchanged).

## Gates
- `tsc` clean · `jest` **87/87 (20 suites)** · `api:check` clean · `expo export` iOS OK · SDK 56, no new deps.

## Notes / ponytail
- Micronutrient chips are display-only (daily estimate chips, not user-entered portions).
- `PlanMeal.items`/`meals` have contract minItems:1 — adding a meal then saving it empty
  would 400 on a real backend (save is fire-and-forget; local cache still holds it). Happy
  path (add item before save) is fine; guard later if it bites.
