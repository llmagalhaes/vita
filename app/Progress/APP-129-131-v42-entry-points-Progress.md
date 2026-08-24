# APP-129…APP-131 — v4.2 entry points + API client (wave 1, builder C)

Session 24, v4.2 build round. Builder: Opus C, in parallel with builder A (food builder,
`app/(main)/build-plan.tsx` + `src/build/food/*`) and builder B (training builder,
`app/(main)/build-program.tsx` + `src/build/train/*` + `PickExerciseSheet`).
Specs: `docs/v4.2/HANDOFF_v4.2_manual_setup.md` §0, §1.1, §1.2, §6 criteria 1/2/14 ·
`docs/v4.2/app-plan.md` §A rows 1–4, §C APP-129..131, §D risks 5/6 ·
`docs/v4.2/backend-plan.md` §1.3, §2.5 · `docs/v4.2/PLAN.md` R2/R3/D9 ·
`docs/contracts/vita-api-v0.yaml` v0.9.0.

This ticket group is the *entry-point* half of v4.2: the two doors into the builders, and the
client the builders call. It deliberately touches nothing inside either builder.

## What shipped

### APP-129 — `mpSheet` + the one-button Meals card

**New `src/library/EatingPlanSheet.tsx`** — presentational, on `SheetOverlay` (which portals
to the root `PopHost`, so it cannot open half off-screen inside the Library `ScrollView`).
Title "Your eating plan"; three rows at the handoff's geometry: `padding 15`, `radius 20`,
`borderWidth 1.5` `rgba(120,100,75,.12)`, `backgroundColor #FFFDF7`, `IconWell` 38×38 radius 13.

| Well | Title | Subtitle | Action |
|---|---|---|---|
| download glyph, `colors.green.bg` / `.ink` | Import a PDF | replaces the plan you have now | the existing `replace()` → `importPdf()` → `/plan-setup?mode=parse&fileRef=…` |
| `Aa`, `colors.amber.bg` / `.ink` | Build it here | meal by meal — no document needed | `router.push("/build-plan")` |
| `+`, `tinted(accent)` / accent | Add a single meal | on top of what is already there | closes the sheet, opens the inline `mealForm` |

`colors.green.*` and `colors.amber.*` already **are** the handoff's `#E7EDE1/#5F7A61` and
`#F7E7D4/#A66A3F` — no new colour literals.

**`src/library/sections/EatingPlan.tsx`**: the two-button row collapses to one
`PillButton tone="tinted"` (height 44, radius 22, accent-12 % fill, accent ink — the
prototype's own shape, already what `PillButton` renders) labelled
`build.eatingSheet.cardButton`. The section keeps owning the three actions; the sheet just
draws them. `busy` still swaps the label to `common.importing` during a pick, as before.

**Criterion 2 / risk 5**: `plan-setup.tsx`, `onboarding/planImport.ts` and every parse phase
are untouched, and `library/__tests__/library-panel.test.tsx` passes unchanged.

### APP-130 — "Build it here" in the training sheet

`src/workout/ImportProgramSheet.tsx`: the second route's label goes
`common.typeOrSpeak` → `build.trainingSheet.here`, with `hereSub` as a caption line under it,
and the handler becomes `onClose(); router.push("/build-program")` — both in one tick, which
is the handoff's `bwOpen` (`st({tiOn:false, bwOn:true, …})`).

The `describing` phase is **not deleted**: it stays mounted and is still reached from the
confirm card's "Adjust", so a mis-transcribed PDF keeps its way out. The PDF route (`runPdf`)
is unchanged (criterion 14).

### APP-131 — client methods, mock, and the time-family label

`types.gen.ts` was already regenerated off v0.9.0 by wave 0, so this was the client half.

```ts
// src/api/client.ts
estimateExerciseMuscles(body: ExerciseMusclesRequest): Promise<ExerciseMusclesResponse>; // D8
estimateWorkoutKcal(body: WorkoutKcalRequest): Promise<WorkoutKcalResponse>;             // D9
```

Types come off `paths[…]` exactly like `estimateFoodKcal`, which already existed from wave 0
and was **not** duplicated.

`src/api/mock.ts`:

- `estimateExerciseMuscles` reads `EXCAT`, turns weights into roles at the **.7** cut (the
  same cut as `tierOf`, CEO Round 15), fans the shared `ar` capsule out to `biceps` **and**
  `triceps` via a mock-local `WIRE_OF` map, and carries `whole` into `wholeBody`. A catalog hit
  is `estimated: false` (curated); a name outside the catalog answers
  `{ muscleRoles: [], wholeBody: false, estimated: true }` so the UI keeps "not mapped" instead
  of inventing a body map.
- `estimateWorkoutKcal` is `sets*reps*0.5 + min*6`, rounded to a multiple of 5 with a floor of
  5, always `estimated: true`. Marked `ponytail:` — the real number comes from the backend's
  catalog metadata; this only has to be stable and plausible in mock/offline.

`WIRE_OF` lives **in mock.ts, not next to `EXCAT`**, on purpose: it is the *server's* half of
the mapping (weights never go on the wire), so it cannot collide with whatever the training
builder needs on its `saveProgram` path.

**Risk 6 fixed at the chokepoint** — new `src/workout/exerciseLabel.ts`:

```ts
export function exerciseMeasure(ex: Pick<Exercise, "sets" | "reps" | "durationMin">): string
// "3 × 10" · "3" · "30 min" · ""
```

`WorkoutNode`'s `setsLabel` and `program.tsx`'s `exerciseLabel` both delegate to it now
(`program.tsx` still appends `· N kg` itself). Both used to render `""` for a hand-built
time-family exercise, so the minutes the user typed were invisible everywhere outside the
builder; one shared helper means no surface can disagree with another.

## Gates

- `npx tsc --noEmit` — **0 errors** in every file this ticket group owns. (The run also showed
  one error in `src/build/train/parts.tsx`, builder B's file, mid-write.)
- `npx jest src/library src/workout src/api src/plan src/day` — **20 suites, 184 passed,
  1 skipped**, including the two suites risk 5 requires to pass unchanged.
- Full `npx jest` — 73 of 75 suites pass; the two failures are builders A and B's own
  in-flight suites (`src/build/food/__tests__/build-plan.test.tsx`,
  `src/build/train/__tests__/build-program.test.tsx`), reproduced across two runs and
  unrelated to these files.

New tests (20 cases):

- `src/library/__tests__/eating-plan-sheet.test.tsx` — one button and the three old labels
  gone; the sheet's 3 rows + subtitles; PDF → `importPdf`; PDF-ready → the plan-setup push;
  Build → `/build-plan`; Add a meal → the inline form and no navigation.
- `src/workout/__tests__/import-program-sheet.test.tsx` — the second route and its subtitle,
  `typeOrSpeak` gone from the chooser, Build closes + pushes, PDF row intact, plus the
  `exerciseMeasure` table.
- `src/api/__tests__/estimate-endpoints.test.ts` — Squat's roles, the arm fan-out, Football's
  pale whole-body answer, an unknown name, positional order, `195` from 4×8 + 30 min, the
  floor of 5, and both HTTP paths.

## Deviations

1. **"min" is hardcoded** in `exerciseMeasure` rather than read from
   `build.program.day.minutes`. The helper is pure, and its siblings (`×`, `kg`) are hardcoded
   the same way; threading `t()` through would need i18n at every call site for one word.
2. **The training sheet keeps `Button` rows**, not the handoff's 38×38 icon-well rows — that
   chrome only exists in the new eating sheet. The subtitle rides as a caption under the
   button. Reshaping `ImportProgramSheet` into the same 3-row chrome is a small follow-up if
   the CEO wants the two sheets identical.
3. **No missing i18n keys.** Every literal these three tickets need was already in the
   `build.*` block from APP-119; `en.json` was not touched.
