# APP-120…APP-123 — v4.2 food builder (wave 1, builder A)

Session 24, v4.2 build round. Builder: Opus A (parallel with builder B = training,
builder C = entry points; disjoint files).
Specs: `docs/v4.2/HANDOFF_v4.2_manual_setup.md` §2 (+ §4 state, §5 tokens, §6 criteria 3–13),
`docs/v4.2/app-plan.md` §B/§C/§D, `docs/v4.2/PLAN.md` R1/R4.

## Files

| File | What |
|---|---|
| `app/(main)/build-plan.tsx` | the route: phases `count → meals → review`, the `bmBack` ladder, the estimate pass, Finish setup |
| `src/build/food/draft.ts` | the pure half: `BuildMeal`/`BuildItem`, `mealsFromSkel`, totals, `emptyItems`/`mergeEstimates`, `saveEdit`, `toDraft` |
| `src/build/food/CountPhase.tsx` | APP-120 |
| `src/build/food/MealsPhase.tsx` | APP-121 |
| `src/build/food/ReviewPhase.tsx` | APP-122 (+ the inline kcal editor and the day total) |
| `src/build/food/__tests__/draft.test.ts` | 13 tests |
| `src/build/food/__tests__/build-plan.test.tsx` | 6 tests |

Nothing else was touched: `en.json`, `src/build/parts.tsx`, `src/plan/estimateKcal.ts`,
`app/(main)/_layout.tsx` and every sibling-builder file are unchanged (the route
auto-registers with the Stack's default `fade_from_bottom`).

## APP-120 — `count`

`PhaseQuestion` + `CountChips values={[3,4,5,6]} max={10}` (the foundation already owns the
`+` ceiling and the extra chip above 6 — criterion 3) + a preview card built from `skel(n)`
(criterion 4) + `Start with {n} meals`, which seeds the meals AND opens the first step's food
form (`setForm(true)` — criterion 5): the first thing you see in the next phase is a field,
not a button.

## APP-121 — `meals`

Card per meal, name/time as box-less dashed-underline `TextInput`s writing straight into the
step's meal. Item rows (7px `#E8B48C` dot · name 14/600 · `"{q} {u}"` 11.5/700 · a 24px `×`).
Add-food form: free name, 72px qty, four unit chips; **`Add food` stacks, clears and stays
open** (with `selectionTick()`), `Done adding` closes, and a dashed `+ Add food` brings it
back. **No kcal field exists on this screen** (criterion 6) — a test asserts the absence.
Progress bar = `meals.length + 1` segments (criterion 7), shared with the review phase, which
occupies the last one.

## APP-122 — `review` + the estimate pass + the editor

- Title/sub switch on `anyK`; per-meal card with total (`#A66A3F` when > 0, `—` `#CFC5B4`) and
  an `edit` link back to that step.
- The **discreet** button (46px, `1.5px rgba(120,100,75,.18)`, `#FFFDF7`/`#6E6355`) shows only
  while `!anyK && !busy` (the prototype's `bmEstIdle`), and becomes the breathing
  `Working through the list…` box (`#F3EBDD`, `vtBreath`) while the pass runs.
- The pass is `Promise.all([estimateKcal(emptyItems(meals)), sleep(1500)])` — 1.5s is a FLOOR,
  not a fake timer — merged by `mergeEstimates` and guarded by a `mounted` ref (criterion 12).
  Only items whose kcal is still empty are ever sent, so a typed number **cannot** be
  overwritten (criterion 11) — that is structural, not a check.
- Estimated `~235` `#A66A3F` over a **dashed bottom border** (not `textDecorationStyle`, which
  Android ignores — this mark may not go missing); typed solid `#453E35`; empty `—` `#CFC5B4`,
  and the dash is tappable too ("fill them in yourself").
- Tapping a number swaps in a 62px accent-bordered input; `onBlur` runs
  `saveEdit(meals, "{mi}-{ii}", raw)` — valid ⇒ stored and `est` dropped, empty/NaN/negative ⇒
  unchanged, stale key ⇒ no-op. `bmEdit` is cleared on **every** phase change (`go()`), and the
  editor is inert while the pass runs — the two halves of app-plan §D risk 2.
- Once there are numbers: day total 19/700 + `kcal` 11.5/700 under **A day, as planned**, plus
  the legend that is the only place the number's origin is explained.

## APP-123 — Finish setup

`toDraft(meals, t("build.plan.summary"))` → `savePlan(doc, "manual")` (unchanged) → toast
→ route pop. Per PLAN R1 the item carries `kcal` (TOTAL at its quantity) **and**
`kcalEstimated`, so the `~` survives onto every plan surface. A meal gets a `kcal` only when
every item in it has one, and `dailyTotals` only when the whole plan does — half a sum is a
wrong number. An empty meal saves as a named slot with `items: []` (contract 0.9.0 `minItems 0`).
`status: "ready"`: the builder IS the review, so the Home "finish setup" banner must not fire.

## Gates

`npx tsc --noEmit` → 0. `npx jest src/build/food` → **19/19 green** (13 pure + 6 route).
Full-suite number in the session report.

## Notes / deviations

1. **The estimate button disappears once any kcal exists** (`bmEstIdle = !anyK && !busy`,
   prototype-exact). So there is no in-UI "estimate again" path; criterion 11 is covered by
   `draft.test.ts` at the function, which is where the invariant lives.
2. `q` is stored as a number and the portion line is rendered only when `q > 0` — a blank
   quantity produces a food with no portion, not "0 g". `quantity` is then omitted on the wire.
3. `Add food` is inert (and dimmed) until the name is non-empty — nothing else is required.
4. Keyboard: the route rides `BuilderShell`'s `KeyboardAvoider`. Full pass is APP-132.
5. `testID`s (`meal-name`, `meal-time`, `build-progress`, `kcal-{mi}-{ii}`, `kcal-input`) exist
   only for the tests — no user-facing string was invented, and `en.json` was not touched.
