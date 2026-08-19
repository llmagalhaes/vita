# APP-101 — Muscle map v4 + per-muscle bottom sheet

Session 23 · Opus builder · scope: `app/services/vita-app/src/muscle/**` + one region of `en.json`.

## What shipped

| File | |
|---|---|
| `src/muscle/muscleData.ts` | new — the pure model: `MUS`, `EXMU`, `muF`, `muT`, tiers, chips, `sessionRows` |
| `src/muscle/BodyMap.tsx` | new — the v4 capsule figure, `viewBox 0 0 190 150`, memoised |
| `src/muscle/MuscleSheet.tsx` | new — the per-muscle bottom sheet (geometry only; rows come from `sessionRows`) |
| `src/muscle/__tests__/muscleData.test.ts` | new — 22 tests |
| `src/i18n/locales/en.json` | added the `muscle.*` namespace (name/front/back/tier/range/sheetSub/openDay/earlier/none/footer/sessionCount) |

## Gates

- `npx jest src/muscle` — **22/22 green** (new suite, +22 tests).
- `npx tsc --noEmit` — **no error in `src/muscle`**. 11 pre-existing errors elsewhere, all cross-ownership,
  NOT touched: `VacationConfig.keepCheckins` (`src/vacation/VacationSheet.tsx`, `src/db/__tests__/vacation.test.ts`,
  `src/__tests__/account.test.tsx`) and `Api.deleteAccount` missing from `src/api/mock.ts`.

## Fidelity notes

- Every primitive in `BodyMap.tsx` is copied coordinate-for-coordinate from the prototype SVG
  (lines 632–664): front x≈48 / back x≈142, head r8, shoulders r7, chest 2×14×16 r6, back 2×14×20 r6,
  arms 9×21 r4.5 + 8×17 r4, core 20×19 r7, traps 18×9 r4, glutes 2×12×13 r6, quads 11×30 r5.5,
  hamstrings 11×26 r5.5, calves 9×22 r4.5, neutral neck/pelvis/shins `#EDE6D8`, FRONT/BACK 8/700 `#B7AB9C`.
  Note the asymmetry is intentional: the front has no traps slot, the back no chest/quads slot.
- `muF(v) = v>0 ? mixOklab(accent, round(16 + v*70), #F0EDE2) : #ECE6D8` — via APP-093's real oklab mix,
  and via `useAccent()` so vacation mode repaints the whole figure.
- `muT` is the prototype's weighted aggregate generalised: the mean per-muscle intensity across the
  sessions in the range. With 2 leg + 2 upper it reproduces the prototype exactly (qu .5, gl .425, co .25).
- Chip thresholds are deliberately different in the two places, as in the prototype: per-program chips
  tint at the **.75** primary tier, Trends chips tint at **.4** and show a session count, sorted desc,
  top 6 of the first 8 muscles, `> .15` to appear at all.
- Sheet: 4 rows max + `+ N earlier sessions in this range`, tier chip, `Open this day →` gated on
  `dayOffset < 10` (the dock range), footer verbatim.

## Deviations / decisions

1. **The plan's deletions were NOT performed** (as instructed): `src/ui/BodyMap.tsx`,
   `src/workout/MuscleMapCard.tsx` and `src/trends/MuscleSheet.tsx` all still exist and still compile —
   v3 screens reference them until waves 3/4 (APP-100 / APP-108) delete the consumers. Deleting them then
   is still part of this ticket's intent.
2. **Real data, not demo data.** `MUS`/`EXMU` are keyed by program name and hold the CEO's two programs
   verbatim, so a real "Leg day" session renders exactly like the prototype. Any other program derives its
   intensities from the session's own exercises (reusing APP-080's `muscleIntensities`) and its exercise
   list from the per-exercise muscles — otherwise an imported program would render a blank body.
   `traps` has no slot in the contract's 11-muscle vocabulary (backend folds it into `back`), so `tr`
   only ever lights up from the canonical table.
3. **Workout-level-muscles fallback** (marked `ponytail:`): a session carrying only `WorkoutDetail.muscles`
   and no per-exercise data tints at .78. It produces **no sheet rows** — there is no honest exercise to
   attribute — which is also the prototype's rule (`EXMU[p][k].length && MUS[p][k]>0`).
4. **No `MuscleChip` component.** The chips are data (`programChips` / `trendChips`); the three consumers
   (workout card, Trends, past day) each render 6 lines of styling. Extract only if all three land identical.
5. `DOCK_DAYS = 10` is a local const, not an import from `src/tabs/home/dock.ts` — APP-099 moves that file.

## For the consumers (waves 3/4)

```ts
import { BodyMap } from "../muscle/BodyMap";
import { MuscleSheet } from "../muscle/MuscleSheet";
import { intensitiesOf, muT, programChips, trendChips, sessionsFromEntries } from "../muscle/muscleData";

const sessions = sessionsFromEntries(entriesInRange("workout", start, end));
<BodyMap intensities={muT(sessions)} maxWidth={240} />            // Trends (240) · workout card (250) · past day (225)
<BodyMap intensities={intensitiesOf(session)} maxWidth={250} />   // one session
<MuscleSheet muscle={key} sessions={sessions} range="week" onClose={…} onOpenDay={(off) => …} />
```

`WorkoutSession` is structural — `WorkoutRecord` from `src/day/record.ts` is assignable as-is.
