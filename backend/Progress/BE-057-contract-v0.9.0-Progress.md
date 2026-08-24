# BE-057 — Contract v0.9.0 + ADR-0020 (manual builders + hybrid estimation)

Asana board: Vita backend (`1216519867368580`) — v4.2 Wave 0, blocks every other v4.2 ticket.
Status: **executed 2026-08-24** (session 24, backend lead). Orchestrator commits; I ran no git.

## What landed

**`docs/contracts/vita-api-v0.yaml` — 0.8.0 → 0.9.0.** Additive except D1, which is a *relaxation*
(every 0.8.0 document still validates). Exactly the nine deltas from `docs/v4.2/backend-plan.md` §1.4
plus D9 from `docs/v4.2/PLAN.md` (CEO Round 16 answer 4).

| # | Section | Change |
|---|---|---|
| — | `info.version` + `info.description` | 0.8.0 → **0.9.0** + the round's summary paragraph |
| — | `tags` | + `estimate` |
| D1 | `PlanMeal.items` | `minItems` 1 → **0** + prose (a named slot with no food yet) |
| D2 | `PlanItem.kcal` | number ≥ 0 — **TOTAL at the stated quantity**, not per unit; integer, multiple of 5 when it came from the estimate pass |
| D3 | `PlanItem.kcalEstimated` | boolean — the estimate label, persisted with the number; **without `kcal` → 400** (documented) |
| D4 | `Exercise.durationMin` | integer ≥ 1 — the time family's minutes; family is derived, not stored |
| D5 | `Exercise.wholeBody` | boolean — "the split is a guess", app paints the pale band |
| D6 | muscle enums ×3 | + `traps` (WorkoutDetail.muscles · Exercise.muscles · Exercise.muscleRoles[].name) + prose fixes ("lats"/"traps" → back becomes "lats" → back; 11 → 12 silhouettes) |
| D7 | new `POST /estimate/food-kcal` | `{items:[{name,quantity,unit}]}` 1..60 (0 or >60 → 400) → 200 `{items:[{kcal: int\|null}]}` positional + total; 401 / 429 (ParseQuota) / 422 (model leg failed with zero table hits) |
| D8 | new `POST /estimate/exercise-muscles` | `{names:[string]}` → `{items:[{muscleRoles,wholeBody,estimated}]}` |
| D9 | new `POST /estimate/workout-kcal` | `{exercises:[{name,fam,sets,reps,min}]}` → `{kcal:int, estimated:true}`, feeds the **existing** `ProgramDay.kcalEstimate` (no schema change there — prose note added) |

D6 is contract-only here. The `Muscles.VOCAB` / alias-drop code change is **BE-059's** job.

Every new field carries "estimate, not a target" prose: `PlanItem.kcal` ("an estimate of what the
plan suggests, never a target — Vita has no goals and no scores"), `kcalEstimated` (the label travels
with the number and persists), `Exercise.wholeBody` ("an honest estimate rendered as an estimate,
never a measurement"), `estimated` on the exercise-muscles response (pale band, never the full tone),
`estimated: true` on workout-kcal ("so the value can never travel without its label"), and
`ProgramDay.kcalEstimate` ("the `~` is part of the label, not decoration").

**`backend/Doc/ADRs/ADR-0020-contract-v0.9.0-manual-builders-hybrid-estimation.md`** — 11 decisions:
hand-built plans/programs ride the existing save paths (with the destructive-POST, born-`ready` and
stale-id consequences named); per-item kcal is a TOTAL not per-unit; the estimate label persists with
the number; the EXCAT → vocabulary translation lives **app-side** with the `.7` primary cut;
`traps` becomes a real muscle + the program save path gets the normalization chokepoint; estimation is
table → cache → Claude (misses only, one batched call, server-side multiple-of-5 rounding, below-
threshold is a miss not a guess); **write-back automatic into the cache, curated into the seed**;
the cache is **user-less plaintext by design** (no `user_id`, no user-tied timestamp — ADR-0003
unchanged, and an explicit "nobody adds a user_id later" clause); the **TACO licence caveat** (ship
now, settle before the store; ODbL/CC-BY-SA sources rejected on terms); a guessed exercise mapping
paints pale or stays "not mapped"; and **D9** workout-kcal for hand-built days.

## Validation

- `npx @redocly/cli@2 lint docs/contracts/vita-api-v0.yaml` → **valid, exit 0**.
  **49 warnings vs 45** on the `HEAD` baseline; the +4 are the same pre-existing cosmetic classes —
  3 × `operation-operationId` (the three new operations; no operation in this contract has one) and
  1 × `tag-description` (the new `estimate` tag). Class counts: `operation-operationId` 34→**37**,
  `tag-description` 7→**8**, `operation-4xx-response` **3** (unchanged), `info-license` **1**
  (unchanged). **Zero errors.**
- One error caught and fixed during the pass: `nullable: true` is not an OpenAPI **3.1** keyword —
  the `/estimate/food-kcal` `kcal` field is expressed as `type: [integer, "null"]`.
- `openapi-typescript 7.13.0` regenerates cleanly against the new file (`kcal?: number | null` on the
  estimate response). The app team's `npm run api:check` will report drift until they commit the
  regenerated `src/api/types.gen.ts` — expected app-side work, not a contract defect.

## Notes for the tickets that follow

- **BE-058** owns D1's server half (drop the "Each meal needs at least one item" line in
  `PlanController.validatePlan()`) and the `kcalEstimated`-without-`kcal` → 400 rule.
- **BE-059** owns D6's code half (`Muscles.VOCAB` + `traps → back` alias drop) and the
  `POST/PUT /program` normalization chokepoint.
- **BE-061/063/065** own D7/D8/D9. The contract fixes three things they must not re-litigate:
  responses are **positional** (same length, same order, `null` for no answer), rounding is
  **server-side** (`max(5, round(k/5)*5)`), and a failed model leg **with** table hits is a partial
  **200**, not an error — only zero hits *and* a failed leg is 422.

## Questions for the CEO

None. CEO Round 16 answered all five open questions from `docs/v4.2/backend-plan.md`; nothing in this
ticket needed a product call.
