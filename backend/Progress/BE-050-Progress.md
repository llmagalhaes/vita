# BE-050 — `PlanMeal.id` (`m-N`) in `PlanService.decorate()`

**Ticket:** BE-050 (v4 wave 2) · **Spec:** `docs/v4/backend-plan.md` §3.5 + §4 · **Contract:** v0.8.0 (`PlanMeal.id`)
**Model:** Opus builder · **Scope:** plans service/model/tests only (entries + migrations owned by a concurrent builder)

## What changed

Meal ids are stamped exactly like item ids, by the same code path, on the same save-time-only rule
(no backfill, CEO A2):

- **POST /plan** → `m-1…m-N` in document order; client-sent meal ids ignored.
- **PUT /plan** → valid round-tripped ids preserved (non-blank, ≤40 chars, unique), new meals get
  `m-(max+1)…`; a duplicate incoming meal id → **400** (`duplicate meal id: …`).
- **GET /plan** and **GET /plan/history** carry the ids (they live inside the stored doc blob).
- **Parse responses carry none** — the parse path never decorates ids, and `PlanMeal.id` defaults null
  with `@JsonInclude(NON_NULL)`, so it is simply absent.

The item- and meal-id logic was identical, so the id generator became one private helper
(`idStamper(incoming, prefix, label, assignFreshIds)`) used by both spaces — net effect is that
`decorate()` got *shorter*, not longer, and the `IT_N` regex is gone (replaced by a prefix/`toIntOrNull`
suffix read that is also correct for `m-`).

No migration, no crypto change, no new endpoint: ids ride `eating_plan.doc_enc`, already AES-256-GCM
under the per-user DEK with AAD `eating_plan.doc_enc`.

## Files touched

| File | Change |
|---|---|
| `src/main/kotlin/com/llmagal/vita/model/ai/PlanDtos.kt` | `PlanMeal.id: String? = null` (+ KDoc). Positioned after `name`, mirroring `PlanItem`. |
| `src/main/kotlin/com/llmagal/vita/service/plans/PlanService.kt` | `decorate()` stamps meal ids; extracted `idStamper()`; `itN()` → generic `suffixOf(prefix, id)`; dropped `IT_N`; KDoc refreshed (class, `importPlan`, `editPlan`). |
| `src/test/kotlin/com/llmagal/vita/plans/PlanFlowTest.kt` | +5 tests (see below). |
| `src/test/kotlin/com/llmagal/vita/ai/PlanParseFlowTest.kt` | +1 assertion line in the existing eating-plan parse test: `draft.meals[0].id` is null. |

## Tests added (+5 in `PlanFlowTest`, +1 assertion in `PlanParseFlowTest`)

1. `POST assigns m-N in document order, client-sent meal ids ignored`
2. `PUT preserves round-tripped meal ids and gives a new meal m-max+1` (drop `m-1`, keep `m-2`, new → `m-3`)
3. `PUT with duplicate meal ids is 400`
4. `history versions carry the meal ids`
5. `the add-a-meal form's synthesized serving item gets 0 to 3 step 1 bounds` — the §4 verification item:
   `quantity 1`, `unit "serving"` routes to the heuristic's `countable()` branch → `min 0 / max 3 / step 1`.
   **No heuristic change** (confirmed by reading `PortionBoundsHeuristic`: `max(2q, q+2)` with `q=1` → 3).
6. `PlanParseFlowTest`: parse draft carries no meal id (A2, no backfill).

## Deviations / notes

- Touched one file outside the strict plans folders: `src/test/kotlin/com/llmagal/vita/ai/PlanParseFlowTest.kt`,
  a single added assertion line. That is the only place the "parse responses carry none" acceptance clause is
  testable, and it is a plan-parse test (no overlap with the entries/migration builder).
- `idStamper` extraction is a refactor of existing item-id code, not new behaviour — item-id semantics and the
  existing `duplicate item id: …` 400 message are unchanged (the legacy-doc test still passes unchanged).
- Left alone deliberately: no backfill for pre-0.8.0 docs (A2 — the CEO re-imports once after deploy);
  `usualOptionIndex` and every other v3 field untouched; programs still get no ids (no consumer).

## Gates

**Plan-scoped suite — GREEN.** `./gradlew test --tests 'com.llmagal.vita.plans.*' --tests
'com.llmagal.vita.ai.PlanParseFlowTest'` → BUILD SUCCESSFUL (3m25s), 0 failures.
Per-suite: `PlanFlowTest` **20** (was 15, +5), `PlanPortionsFlowTest` 12, `PlanUsualsFlowTest` 8,
`PortionBoundsTest` 23, `ProgramFlowTest` 3, `PlanParseFlowTest` 6 — all pass.

**Full tree — NOT green, and not because of this ticket.** Run against the merged working tree while the
concurrent BE-048 builder was mid-edit:

- `./gradlew check` → **detekt FAILED**, single issue, in the other builder's file:
  `service/entries/EntryService.kt:232 normalize()` CyclomaticComplexity 24 > 15. `check` aborts before
  `test`, so it never reached the suite. No detekt issue in any plans file.
- `./gradlew test` (whole suite, to get an honest number) → **245 tests, 1 failure**:
  `entries.EntryFlowTest > C3 content is encrypted at rest` (`expected: 300 but was: 0`, EntryFlowTest.kt:355)
  — again the other builder's file, an entries/crypto assertion with no plans code in its path.

Every plan suite is green in that same full run. Per the orchestrator's instruction, the merged tree is
gated by the orchestrator once BE-048 lands; nothing here is blocked on it.
