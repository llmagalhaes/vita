# v4.2 — App plan (manual setup: hand-built eating plan + hand-built program)

Source of truth: `~/Downloads/HANDOFF_v4.2_manual_setup.md` (§1 routes, §2 food builder,
§3 training builder, §4 state, §5 tokens, §6 acceptance, §7 discarded). Everything below is
*how it lands in this codebase*; where the handoff and the code disagree, the handoff wins on
behaviour and the codebase wins on mechanism (routes instead of `z-index`, `SheetOverlay`
instead of hand-rolled sheets).

`docs/v4.2/backend-plan.md` did not exist when this was written — §B marks every API
assumption **[ASSUMPTION]** for the orchestrator to reconcile.

---

## A. Surface map

| Handoff | Where it lands | Reuses | New |
|---|---|---|---|
| `mpSheet` (§1.1) | `src/library/EatingPlanSheet.tsx`, opened from `sections/EatingPlan.tsx` | `SheetOverlay` (portals to `PopHost`), `library/parts` `IconWell`/`PillButton`, `tinted()` | 3-row chooser; the card's button row collapses from 2 buttons to **1** ("Import or build your plan") |
| Route "Import a PDF" | existing `EatingPlan.replace()` → `importPdf()` → `router.push("/plan-setup?mode=parse&fileRef=…")` | **unchanged** (criterion 2) | — |
| Route "Add a single meal" | existing inline `mealForm` inside `EatingPlan.tsx` (kept verbatim, now opened from the sheet) | — | — |
| `tiOn` second row (§1.2) | `src/workout/ImportProgramSheet.tsx` — the `Type or speak it` button becomes `Build it here` → `router.push("/build-program")` | the whole sheet | one button's label + handler. The `describing` phase stays mounted, reachable only from the confirm card's "Adjust" (zero risk to criterion 14) |
| `bmOn` food builder (§2) | **route** `app/(main)/build-plan.tsx`, phases `count → meals → review` | `plan-setup.tsx` is the precedent (phased full-screen route, `fade_from_bottom` from `(main)/_layout`), `BackButton`, `Button`, `Text`, tokens | 3 phase bodies + the review-phase inline kcal editor |
| `bwOn` training builder (§3) | **route** `app/(main)/build-program.tsx`, phases `shape → days` | same shell | 2 phase bodies |
| `bwPick` add-sheet (§3.5) | `src/workout/PickExerciseSheet.tsx`, rendered by `build-program` | `SheetOverlay` (`lift` for the search field), `Chip` | 2 stages in one sheet, family filter, free-entry row |
| Live muscle map (§3.6) | card inside `build-program`'s day phase | `muscle/BodyMap.tsx` **+2 optional props** (`labels`, `fill`) | the coverage/`mfill` maths (new module, §B) |
| Shared builder chrome | `src/build/parts.tsx` | — | exactly three things: `BuilderShell` (bg `#F7F2E9`, header, eyebrow, step label, back), `CountChips` (chips + dashed `+`, ceiling), `PhaseQuestion` (27/600 + sub). Nothing else is shared — the two builders have different rhythms (§7). |

Screens, not overlays: the handoff's `z-index:81` is a DOM artefact. Expo Router `Stack`
screens already fade+rise (`fade_from_bottom` == `vtIn`) and give the Android back button the
right meaning for free. `PanelShell` renders panels *above* the Stack, so a builder pushed from
the Library needs the same treatment as `plan-setup`/`account`: it is a Stack screen and the
panels are not visible behind it.

`BodyMap` changes (criterion 22): add `labels = true` — when false, drop the two `<SvgText>`
captions and switch the viewBox to `0 0 190 134` (aspect ratio follows). Add
`fill?: (k: MuscleKey) => string` — when passed it replaces the internal `muF(intensities[k])`,
so the builder's two-source `mfill` paints the same capsules without duplicating 40 coordinates.
Trends and every existing caller keep their current call shape untouched.

---

## B. Data flow

### Food: builder draft → `EatingPlanDraft`

Builder-local shape stays the handoff's (`{ n, q, u, k, est }`) — small, cheap to edit, no ids.
One pure function converts at "Finish setup":

```
meals[i] → { name: m.n, time: m.t, kcal: Σ items.k (omitted when all null),
             items: [{ name, quantity: q, unit: u,
                       nutritionPerUnit: k != null ? { kcal: k / q } : undefined }] }
doc = { summary: t("build.plan.summary"), status: "ready", meals }
```

`nutritionPerUnit` is **per unit** (contract `MacroTotals.kcal` required, macros optional), and
`k` is the whole-quantity number — hence `k / q`. `plan/compute.mealUsualTotals` multiplies back
and reproduces `k` exactly. `status: "ready"`: the builder **is** the review, there is no second
review pass (unlike the PDF path, which saves `"review"` and is finished in `plan-setup`).

Entry point: **`savePlan(doc, "manual")`** in `src/db/plan.ts`, unchanged. It already does
everything this needs — cache first (works offline), `setPlanMeta("manual")` for the source
badge, `clearPortions()` because a new plan version voids positional overlay ids, `dirty` flag,
POST + adopt the server's ids, silent re-push on the next sync if offline. **No change to
`db/plan.ts`.**

**`est` never reaches the wire.** The contract's `PlanItem` has no `estimated` flag, and the
`~` / dashed / `#A66A3F` rendering only exists in the builder's *review phase* — pre-save.
After Finish setup the plan is rendered by the existing Eating Plan / Day surfaces with their
own estimate conventions (`EstimateTag`). So `est` is builder-local state, and the
never-overwrite rule (criterion 11) is a within-session invariant of the estimate pass:
`it.k != null ? it : { ...it, k: est, est: true }`. See the open question if the CEO wants the
mark to survive the save.

### Estimation

One seam, `src/plan/estimateKcal.ts`:

```ts
estimateKcal(items: {name, quantity, unit}[]): Promise<(number|null)[]>   // index-aligned
```

- **[ASSUMPTION]** online: `POST /v1/plan/estimate` → `{ items: [{ kcal: int, estimated: true }] }`,
  kcal already a multiple of 5, floor 5, index-aligned with the request, `null` for "no idea".
  Client `api.estimateKcal` + `mock.ts` entry.
- offline / mock / any throw / any timeout: the handoff's own `FKG` (57 keys) + `FKU` (15 keys)
  tables and `estK()` (§2.4), shipped client-side. This is not a second implementation for its
  own sake: mock mode and offline must both work, and criterion 8 pins the *table's* output
  (`Oats 60 g → 235`), so the table has to exist on the device anyway. `mock.ts` imports the same
  table — one copy. **The backend must implement the same rounding contract** (`round(x/5)*5`,
  min 5) or the two paths will disagree on the CEO's device.
- busy state: `Promise.all([estimateKcal(...), sleep(1500)])` — 1.5 s **minimum**, not a fake
  timer; a slower backend just takes longer. Guard on exit (criterion 12): a `mounted` ref, and
  the setState is skipped when the route is gone.

### Training: builder draft → `TrainingProgramDraft`

```
days[i] → { name: d.n, exercises: ex.map(e => ({
             name: e.n,
             sets/reps: Number(...) when fam === 'set',
             minutes:   Number(e.min) when fam === 'time',      // [ASSUMPTION] contract add
             muscleRoles: weights → role (≥ .7 primary, else secondary), dropped when {} })) }
doc = { summary: bwName || t("build.program.fallbackName"), days }
```

Entry point: **`saveProgram(doc)`**, unchanged.

**Only one contract gap is real.** Fractional weights (`{qu:1, gl:.85}`) and the whole-body
`soft` flag do **not** need to be persisted: `EXCAT` is a client-side, deterministic catalog
keyed by exercise *name*, so both re-derive on read from the name alone. A free-form entry has
no weights to lose. What cannot be re-derived is the number the user typed: **`Exercise.minutes`**
(a 30-minute Muay thai session otherwise saves as a name with no measure).
Ask the backend for `minutes?: number` (contract v0.9.0, additive, optional).
Fallback if refused: a device-local kv sidecar keyed `programDay|exerciseName → minutes`
— mark it `ponytail:` with "delete when the contract carries minutes".

`EXCAT` lives in a **new** `src/workout/exerciseCatalog.ts`, not in `muscleData.ts`:
`muscleData` is the read model for Trends/records over the *contract* vocabulary; the catalog is
an authoring table. It imports `MuscleKey`/`MUSCLE_KEYS` from `muscleData` — the 10-key
vocabulary is identical, chip order is `MUSCLE_KEYS` order (§3.6), and `muscle.name.*` i18n keys
already exist for all ten. `tr` (traps) has no contract muscle of its own — the backend folds it
into `back` — which is fine here because the weights are never persisted.

The module is pure and holds: `EXCAT`, `coverage(ex[]) → {covS, covD}` (`Math.max`, never sum —
criterion 20), `mfill(k, covS, covD, accent)` (`20 + s*50` % / `8 + d*20` % over `#EDE6D8`, via
the existing `mixOklab`), `dominant(mus, 3)`, `search(query, fam)`.

---

## C. Tickets

Sizes: S ≈ one file, M ≈ a phase or a sheet, L ≈ a whole screen.

### Wave 0 — foundation (one builder; everything else waits on it)

| # | Title | S | What / AC |
|---|---|---|---|
| **APP-115** | Exercise catalog + coverage maths | M | `src/workout/exerciseCatalog.ts`: `EXCAT` (23 set + 24 time, verbatim §3.4), `coverage`, `mfill`, `dominant`, `search`. Pure, unit-tested. AC 18, 19, 20 (the handoff's five check values are the test table). |
| **APP-116** | kcal estimate seam + food table | M | `src/plan/estimateKcal.ts` with `FKG`/`FKU`/`estK` (§2.4) + the API path behind it; `mock.ts` uses the same table. Pure, unit-tested. AC 8 (`Oats 60 g → 235`, unknown-in-`g` → ×1.3), rounding to 5 / floor 5. |
| **APP-117** | `BodyMap` `labels` + `fill` props | S | Optional props only; Trends/workout/past-day call sites unchanged. AC 22. |
| **APP-118** | Builder shell + `skel(n)` | M | `src/build/parts.tsx` (`BuilderShell`, `CountChips`, `PhaseQuestion`) + `MSLOT`/`skel(n)` (§2.2) as a pure, tested function. AC 3, 4 (n=7 exact list, chronological), 15 (ceiling 10 → `Day J`). |
| **APP-119** | All v4.2 copy in `en.json` | S | Every literal from the handoff under `build.*`, written up-front so the parallel builders never touch `en.json` again (it is one file — this is the merge-conflict fuse). AC 13 (no "AI", "assistant", no emoji — grep in the test). |

### Wave 1 — three builders, disjoint files

**Builder A — food (`app/(main)/build-plan.tsx` + `src/build/food/*`)**

| # | Title | S | What / AC |
|---|---|---|---|
| **APP-120** | `count` phase | M | Question, chips `3 4 5 6` + dashed `+` to 10, skeleton preview card, CTA `Start with N meals` which enters `meals` **with the food form already open**. AC 3, 4, 5. |
| **APP-121** | `meals` phase | L | Progress bar of `N+1` segments, editable name/time (dashed underline inputs), item list with `×`, the add-food form (name / qty / 4 unit chips, `Add food` keeps the form open + `vib()`), dashed `+ Add food`, footer note. **No kcal field anywhere.** AC 6, 7. |
| **APP-122** | `review` phase + estimate pass + inline editor | L | Per-meal cards with `edit` back-links, the discreet `Fill in the calories for me` button, the breathing `Working through the list…` state, the tap-to-edit kcal input, day total + legend. AC 9, 10, 11, 12. |
| **APP-123** | Finish setup → `savePlan` | S | Draft → `EatingPlanDraft` (§B), `savePlan(doc, "manual")`, toast `"{n} meals saved — your Day is set up"`, route pop. AC: Home/Library/Day render the built plan; portions overlay cleared; the Home "finish setup" banner does **not** fire (`status: "ready"`). |

**Builder B — training (`app/(main)/build-program.tsx` + `src/build/train/*` + `PickExerciseSheet`)**

| # | Title | S | What / AC |
|---|---|---|---|
| **APP-124** | `shape` phase | M | Name input, `How many different sessions` chips `1…5` + `+` to 10, `Day A…J` preview with `empty` labels, footer, CTA `Fill in Day A`. AC 15. |
| **APP-125** | `days` phase — day card | M | Dashed day-name input, exercise rows (family badge + the two 11×11 icon paths, up to 3 dominant muscles or `not mapped`, `3 × 10` / `30 min`, remove `×`), empty state, `+ Add exercise or activity`, `Next day` / `Finish setup`. |
| **APP-126** | `bwPick` two-stage sheet | L | Stage 1: family selector (the filter, not a form detail), search, catalog rows with `WHOLE BODY` badge, free-entry row. Stage 2: `bwStageHint` three cases, `Sets × Reps` or `Minutes`, `Back to list` / `Add to day`. AC 16, 17, 21. |
| **APP-127** | Live muscle map card | M | `BodyMap` (`labels={false}`, `fill=mfill`) + `What this day touches` chips in `MUSCLE_KEYS` order, two ink tones, the two empty/soft strings. AC 18, 19, 20, 23 (no warning, no suggestion, no balance judgement — grep the copy). |
| **APP-128** | Finish setup → `saveProgram` | S | Draft → `TrainingProgramDraft` (§B), `saveProgram`, toast `"{name} saved — {n} days"` (singular `day`), `My program` fallback. Includes the `minutes` handling agreed with backend. |

**Builder C — entry points + contract (touches `library/`, `workout/ImportProgramSheet.tsx`, `api/`)**

| # | Title | S | What / AC |
|---|---|---|---|
| **APP-129** | `mpSheet` + one-button Meals card | M | New `EatingPlanSheet`, the card's button row → one tinted button, the 3 rows wired (PDF → existing flow untouched, Build → `/build-plan`, Add a meal → the existing inline form). AC 1, 2. |
| **APP-130** | `Build it here` in the training sheet | S | One row's label + handler in `ImportProgramSheet`. PDF path untouched. AC 14. |
| **APP-131** | Contract + API client: `minutes`, `/plan/estimate` | S | Regenerate `types.gen.ts` off the reconciled contract, add the two client methods + mock entries, teach `WorkoutNode.exerciseLabel` and `program.tsx.exerciseLabel` to render `30 min` when `sets`/`reps` are absent. |

### Wave 2 — after both builders land

| # | Title | S | What |
|---|---|---|---|
| **APP-132** | Keyboard + scroll pass | M | Every input in both builders reachable with the keyboard up (see §D); `KeyboardAvoider` on the two routes, `lift` on `bwPick`. |
| **APP-133** | Emulator drive of all 23 criteria | M | Walk §6 top to bottom on the emulator, both builders, mock and prod, and record the result. |

---

## D. Risks

1. **Keyboard in a full-screen builder.** Both builders are `ScrollView`s full of small inputs
   (meal name/time, food name/qty, day name, sets/reps/minutes) with a CTA pinned near the
   bottom. Android edge-to-edge in this app does **not** apply `adjustResize` (see
   `src/ui/keyboard.tsx`) — `KeyboardAvoider` is the only mechanism that works here, and the
   time field (`66px`, right-aligned, numeric) is the one most likely to end up under the
   keyboard. Mitigation: `KeyboardAvoider` wraps each route's scroll view, APP-132 verifies each
   field on a real device height, and the review-phase editor scrolls its own row into view.
2. **The inline kcal editor (`bmEdit`).** A single string key `"{meal}-{item}"` addressing a
   nested array, with `onBlur` save, on a list that re-renders on every keystroke elsewhere. The
   failure mode is a stale index after an `edit` back-link changed the meal list. Mitigation:
   the editor is only reachable from the `review` phase (list frozen), `bmEdit` is cleared on
   every phase change, and the save is a pure `(draft, key, value) → draft` function with tests
   for empty / `NaN` / valid (AC 10, 11).
3. **i18n volume.** ~120 new strings, all English, in one 783-line `en.json`. Three parallel
   builders editing it is a guaranteed conflict — hence APP-119 lands the whole `build.*` block
   in wave 0 and wave 1 only *reads* keys. Criterion 13 is enforced by a test that greps the
   `build.*` subtree for `AI`, `IA`, `assistant`, `Vita thinks` and emoji.
4. **Mock / offline.** Both builders must be fully walkable with `apiBaseUrl=""`. The only
   network call in the whole feature is the estimate, and it falls back to the on-device table
   (§B), so the answer is: nothing here blocks on connectivity, and the mock APK behaves
   identically to prod except for the source of the kcal numbers. Note the known mock-mode
   gotcha: a built plan/program does not survive a restart in mock (the in-process server loses
   it) — expected, same as vacation.
5. **Regression on the two import flows (criteria 2 and 14).** The Meals card loses a button and
   the training sheet loses its describe route; both changes sit one line away from
   `importPdf()`/`parseTrainingProgram`. Mitigation: APP-129/128 are explicitly *entry-point*
   tickets — they may not touch `plan-setup.tsx`, `onboarding/planImport.ts`, or the parse
   phases; the existing `library/__tests__` and `workout/__tests__` suites must pass unchanged,
   and the emulator drive re-runs a real PDF import once (`docs/v4/meal-plan.pdf`).
6. **Time-family exercises in existing surfaces.** A program day whose exercises carry `minutes`
   and no `sets`/`reps` flows into `WorkoutNode`, `program.tsx`, the Day workout tab and the
   muscle model. The label helpers already null-guard (they render `""`), so nothing breaks —
   but the measure the user typed would be invisible until APP-131 teaches them `30 min`.

---

## Open questions for the CEO

1. **Does the estimate mark survive the save?** In the builder's review phase an estimated kcal
   shows `~235`, dashed, `#A66A3F`. Once the plan is saved, the Eating Plan and Day screens show
   it as a plain number like any other plan number — the contract has no per-item "estimated"
   flag. Keep it that way (an estimate is a scaffold you correct *before* finishing), or should
   the plan carry the mark forever (a contract field, and every plan surface grows a second
   number style)?
2. **`Add a single meal` after a plan already exists.** The sheet's third route appends one meal
   to the current plan, but the second route (`Build it here`) builds a *whole* plan. If someone
   with a plan taps `Build it here`, do we replace the existing plan silently, or confirm first
   ("this replaces the plan you have now", the same warning the PDF route's subtitle carries)?
3. **Does the training builder replace or append?** Same question for programs, which have no
   review state at all: building a second program today overwrites the first with no warning.
4. **`Type or speak it` for programs is being deleted** (it becomes `Build it here`). It is the
   only spoken route into a program today. Confirmed gone, or does it stay as a third row?
5. **Time-family exercises and the day's kcal estimate.** `ProgramDay.kcalEstimate` powers the
   Today workout tab's `~{kcal}` line and is a *backend* number from the parse. A hand-built day
   has none, so that line just disappears. Fine, or should a hand-built day get an estimate too
   (a second estimate endpoint, for movement)?
