# APP-115…APP-119 — v4.2 builder foundation (wave 0)

Session 24, v4.2 build round. Builder: Opus (single builder — the three screen builders of
wave 1 only READ what is here, so these module APIs are their contract).
Specs: `docs/v4.2/app-plan.md` §A/§B/§C, `docs/v4.2/PLAN.md` (R1–R5),
`docs/v4.2/HANDOFF_v4.2_manual_setup.md` §2.2, §2.4, §3.4, §3.6, §5, §6.

## What shipped

### APP-115 — `src/workout/exerciseCatalog.ts` (new)

`EXCAT`, the authoring table keyed by exercise NAME, deliberately NOT in `muscleData.ts`
(that is the read model over the contract's muscle vocabulary; this is authoring data whose
weights never reach the wire — a saved program re-derives them from the name).

```ts
export type Family = "set" | "time";
export type ExWeights = Partial<Record<MuscleKey, number>>;
export type CatalogEntry = { name: string; fam: Family; mus: ExWeights; whole: boolean };
export const EXCAT: CatalogEntry[];                       // 23 by set + 23 by time
export type CoverageSource = { mus?: ExWeights; soft?: boolean };
export type Coverage = { covS: ExWeights; covD: ExWeights };
export function coverage(exercises: CoverageSource[]): Coverage;
export function mfill(key: MuscleKey, cov: Coverage, accent: string): string;
export function dominant(mus: ExWeights | undefined, n = 3): MuscleKey[];
export function search(query: string, fam: Family): CatalogEntry[];
```

`coverage` keeps two maps and takes `Math.max`, never a sum (criterion 20 — summing turns
coverage into a score). `mfill` mixes over `#EDE6D8` through the existing `mixOklab`:
by-set `20 + s*50` %, whole-body `8 + d*20` %, `covS` always beating `covD`.

### APP-116 — `src/plan/estimateKcal.ts` (new) + api client/mock

```ts
export type EstimateItem = { name: string; quantity?: number; unit?: string };
export const FKG: Record<string, number>;   // 57 keys, kcal per g/ml
export const FKU: Record<string, number>;   // 15 keys, kcal per unit/serving
export function estK(it: EstimateItem): number;                       // device-side table
export function estimateKcal(items: EstimateItem[]): Promise<(number | null)[]>;  // the seam
```

Online leg `POST /v1/estimate/food-kcal` (PLAN R2) through a new
`api.estimateFoodKcal(body: FoodKcalRequest): Promise<FoodKcalResponse>` — both types taken
straight off `types.gen.ts` `paths`, so contract drift is a tsc error. Offline / mock / throw
/ timeout falls back to `estK`; `api/mock.ts` answers from the SAME `estK`, so there is one
device-side copy of the table. Results are index-aligned by construction (a short server
array pads with `null` rather than shifting the plan), and past the contract's 60-item cap
the pass is sliced instead of 400ing.

The seam takes only the items whose kcal is still empty — the never-overwrite rule
(criterion 11) lives in the caller, because this module cannot tell typed from estimated.

### APP-117 — `src/muscle/BodyMap.tsx` (2 optional props)

`labels = true` (false drops the two `SvgText` captions and switches the viewBox to
`0 0 190 134`, aspect ratio following) and `fill?: (k: MuscleKey) => string` (replaces the
internal `muF` call). Every existing call site — Trends, workout card, past day — is
byte-identical and untouched.

### APP-118 — `src/build/parts.tsx` (new)

```tsx
export function BuilderShell({ eyebrow, step?, onBack, backLabel, children });
export function PhaseQuestion({ text, sub? });
export function CountChips({ values, value, onChange, max = 10, height = 58,
                             fontSize = 20, plusWidth = 50, plusLabel = "+" });
export const MSLOT: [name: string, time: string, priority: number][];
export function skel(n: number): [name: string, time: string][];
```

`BuilderShell` owns the canvas, the Plan-Setup header and a `KeyboardAvoider`-wrapped
ScrollView — so APP-132's keyboard pass is one file, not two. `CountChips` carries the
ceiling logic: above the base row the current value joins as an extra selected chip, the `+`
climbs to `max` and disappears there. `skel(n)` is the handoff's priority-slot algorithm
verbatim (sorts on a copy — `MSLOT` is never mutated).

Nothing else is shared, per handoff §7: the two builders have different rhythms.

### APP-119 — `src/i18n/locales/en.json` `build.*`

~110 strings: `build.eatingSheet.*` (§1.1 rows), `build.trainingSheet.*` (§1.2),
`build.plan.*` (count / meals / review incl. both title-sub pairs, the estimate legend and
plural save toast), `build.program.*` (shape / day / pick / map, plural save toast), plus the
`build.program.dayKcal*` keys APP-135 needs (PLAN D9) so wave 2 never reopens this file.

## Tests (+34, all new)

| File | Tests | Covers |
|---|---|---|
| `src/workout/__tests__/exerciseCatalog.test.ts` | 12 | criteria 17–21, the five handoff check values (Squat quads 70 % / glutes 63 % / core 35 %, Football hamstrings 18 % / calves 17 %), max-not-sum, covS over covD |
| `src/plan/__tests__/estimateKcal.test.ts` | 12 | criterion 8 (Oats 60 g → 235, unknown g ×1.3), all four unit defaults, multiple-of-5 + floor-5, index alignment, null passthrough, fallback on throw, 60-item slicing, mock parity |
| `src/build/__tests__/parts.test.tsx` | 6 | criterion 4 (n=7 exact list, chronological), n=3…10 table, clamps, MSLOT immutability, CountChips ceiling (criteria 3/15) |
| `src/i18n/__tests__/buildCopy.test.ts` | 2 | criterion 13 (no `AI`/`IA`/assistant/persona/emoji anywhere under `build.*`), plus criterion 23's no-judgement grep over `build.program.*` |
| `src/muscle/__tests__/bodyMap.test.tsx` | 2 | criterion 22 (captions + viewBox both ways), the `fill` override |

## Gates

`npx tsc --noEmit` → **0 errors**. `npx jest` → **68 suites, 515 passed / 1 skipped**
(baseline 481/1 → +34).

## One real bug found on the way

`api/mock.ts` importing `estK` closed a require cycle (`api/index` → `mock` →
`plan/estimateKcal` → `api/index`), which left the mock half-initialised and broke 8 suites
with `Cannot read properties of undefined (reading 'uuid')`. Fixed at the same chokepoint the
codebase already uses for this (`api/index.ts`, `client.ts`): `import type { Api }` plus a
lazy `require("../api")` at call time inside `estimateKcal`.

## Deviations from the ticket text

1. **Back button 42px, not 34px.** `BuilderShell` reuses the app-wide `BackButton`, which the
   CEO deliberately enlarged to 42px in batch #8 (thin circles read tiny on-device). No
   acceptance criterion names the size. Marked `ponytail:` in the file.
2. **23 by-time catalog entries, not 24.** The handoff's §3.4 heading says 24 but the block
   lists 23 (`Plank` … `Walk`). Shipped the 23 that exist, verbatim.
3. **`MSLOT` names stay data, not i18n.** They seed a field the user edits immediately, so
   they are user content, not chrome — the only handoff literals outside `build.*`.
4. **`estimateKcal` has no busy-state helper.** The handoff's 1.5 s minimum and the
   route-exit guard (criterion 12) belong to the review phase (APP-122), not to the seam.
