# BE-051 — Plan-aware capture (plan digest + tool-schema extension for `/parse/text` and `/parse/photo`)

**Ticket:** BE-051 (v4 wave 3) · **Spec:** `docs/v4/backend-plan.md` §3.6 + §4 · **Contract:** v0.8.0 (prose only on
the two parse endpoints; the fields landed in §3.1/§3.2 with BE-047/BE-048)
**Model:** Opus builder · **Scope:** `service/ai` + `ParseController` + one read method on `PlanService`. No
endpoint, no request/response schema, no migration, no persistence.

## What changed

**The whole feature is additive to the prompt.** With no plan the request bytes are exactly what 0.7.0 sent —
asserted against a golden captured from the pre-change code and committed
(`src/test/resources/golden/parse-text-request-v0.7.0.json`).

1. **Digest** (`service/ai/PlanDigest.kt`, new, ~50 lines). Plain text, one line per meal
   (`m-2 | Almoço | 12:30`), then its items (`  it-2 | Arroz branco | 150 g | 1.3 kcal/unit`), then each option
   (`  option 0 | Opção 2 - Brunch` + its items). **Swap lists excluded** (§3.6). Doubles print without a
   trailing `.0`. Only **id-carrying** meals/items are listed — the id is what the draft points back at, and ids
   are save-time-only with no backfill (CEO A2), so a plan stored before BE-050 produces **no digest at all** and
   capture is 0.7.0 verbatim (covered by a test).
2. **`ParseService`** takes `PlanService` and an optional `userId` on both `parseText`/`parsePhoto`
   (null → no digest, which is what every existing unit test exercises). It loads the plan via the new
   `PlanService.currentEatingPlan(userId)` (per-user DEK decrypt, reusing `current()` + the service's mapper) and
   passes the digest down. The model's plan fields ride through `detail` untouched — nothing to map, nothing to
   validate here (drafts are never persisted; `POST /entries` validates them, BE-048).
3. **`ClaudeClient`** — `parseText`/`parsePhoto` gain `planDigest: String? = null`. With a digest:
   a third **system** block (`PLAN_INSTRUCTION`: match → return the FULL resulting composition, every item tagged
   `replacesItemId`, `planStatus` = `done` when nothing differs else `adjusted`, `skipped` for a meal not eaten,
   `planOptionIndex` for an option) and the digest itself in the **user** turn inside `<eating_plan>` tags,
   marked as data. The digest is transcribed from a document the user uploaded, so it goes where user data goes.
4. **Tool schema** — `TOOL` (unchanged) and `PLAN_TOOL` are now both built by `toolSpec(planAware)`; the
   plan-aware one declares `planMealId` / `planStatus` (enum) / `planOptionIndex` and `items[].replacesItemId` on
   `detail`. No `additionalProperties:false` there — `detail` is polymorphic across meal/water/workout.
5. **Cost line** — `ParseService` now logs one INFO line per capture, mirroring `PlanParseService`:
   `parse capture=text outcome=success plan=true inputTokens=2871 outputTokens=412`. The `plan=` flag makes the
   digest's input-token cost (§4 Q4) queryable in CloudWatch. The BE-014 per-user daily quota already gates it —
   the controller acquires the quota before the parse, unchanged.
6. **`ParseController`** passes the JWT subject (already parsed for the quota) to both parse calls.

## Files touched

| File | Change |
|---|---|
| `src/main/kotlin/com/llmagal/vita/service/ai/PlanDigest.kt` | **new** — the compact digest builder. |
| `src/main/kotlin/com/llmagal/vita/service/ai/ClaudeClient.kt` | `planDigest` param on both parse calls; `systemBlocks()` / `planBlock()` / `tool()` helpers; `PLAN_INSTRUCTION`; `toolSpec(planAware)` → `TOOL` + `PLAN_TOOL`. |
| `src/main/kotlin/com/llmagal/vita/service/ai/ParseService.kt` | `PlanService` dep, `userId` params, `planDigest()`, INFO cost line. |
| `src/main/kotlin/com/llmagal/vita/service/plans/PlanService.kt` | `+ currentEatingPlan(userId): EatingPlanDraft?` (one expression, reuses `current()`). |
| `src/main/kotlin/com/llmagal/vita/controller/ai/ParseController.kt` | passes `userId` to `parseText`/`parsePhoto`. |
| `src/test/resources/golden/parse-text-request-v0.7.0.json` | **new** — the pre-change request body, captured before a line of this ticket was written. |
| `src/test/kotlin/com/llmagal/vita/ai/PlanAwareParseTest.kt` | **new**, 8 tests. |
| `src/test/kotlin/com/llmagal/vita/ai/PlanAwareParseLiveEvalTest.kt` | **new**, `@Tag("live")`, 1 test. |
| `ParseFlowTest` / `ParseEvalTest` / `ParseLiveEvalTest` / `ParseControllerTest` | constructor + mockk stub arity only. |

## Tests

**+8** in `PlanAwareParseTest` (WireMock, never the live API):

1. `no plan` → the request is **byte-identical** to the committed 0.7.0 golden.
2. `a plan with no stamped meal ids` → same golden (A2 fallback).
3. `with a plan` → digest lines, option line, tool fields and the instruction block are all in the body; the
   swap name (`Batata doce`) and the id-less meal are **not**.
4. `match` → `planMealId` `m-2`, `planStatus` `adjusted`, both items tagged (`it-2`, `it-3`), server fields
   (`isEstimate`, `inputMethod`) still applied.
5. `partial match` → matched meal + an unplanned draft in one response; the second carries no plan keys.
6. `no match` → free-form draft passes through with no plan fields.
7. `422 branch unchanged` with a plan loaded.
8. `INFO cost line` → exact line asserted via a logback `ListAppender`, `inputTokens=2871` included.

**+1** `@Tag("live")` (`PlanAwareParseLiveEvalTest`, ≈$0.02/run, **not run here**): the real
`/eval/v3-meal-plan-golden.json` (the committed parse of `meal-plan.pdf`), ids stamped as `decorate()` would,
against a live "almocei como planejado, mas troquei o milho por batata doce" → asserts the lunch `planMealId`,
`planStatus: adjusted`, and a `replacesItemId` pointing at the starch item. Skips cleanly with no
`ANTHROPIC_API_KEY`.

## Gates (scoped — the orchestrator gates the merged tree)

- `./gradlew test --tests 'com.llmagal.vita.ai.*'` → **55/55 green** (was 47; +8). Live tag excluded as usual.
- `./gradlew detekt ktlintCheck` → **clean** (ran `ktlintFormat` once; `MagicNumber` on the tool's `maxItems`
  became `MAX_TOOL_DRAFTS`, mirroring `ParseService.MAX_DRAFTS`).

## Deviations / decisions

1. **Live eval phrase.** The plan's example ("swapped the rice for sweet potato") does not exist in the real
   plan — its lunch starch is *Milho verde cozido no vapor*, and *Batata doce cozida* is one of that item's
   swaps. The eval swaps the **corn** for sweet potato; the assertion shape is unchanged. Documented in the
   test's KDoc.
2. **Digest ignores the portion overlay** (`plan_portions`) and the plan `status` (`review` vs `ready`): the
   digest is the plan as stored. The overlay is a today-only device concern and BE-053 recommends deleting it.
3. **A plan-load failure is not swallowed.** If the DEK decrypt throws, the capture 500s rather than silently
   degrading to a plan-less parse — a decrypt failure is a real fault, not a fallback condition.
4. **`userId` is nullable on `ParseService`** (default null = no digest). It keeps every pre-existing unit test
   honest about what it exercises, and the controller always passes a real one.
