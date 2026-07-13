# BE-014 — AI guardrails for the parse pipeline (ADR-0005)

Asana: Vita backend board `1216519867368580` — task BE-014 (moved to **In progress**).
DoD reminder: Done = in production; this is local-first (`./gradlew check`), no prod deploy.

## What shipped

Three guardrails around the BE-013 `/v1/parse/text` pipeline, all in the existing `ai/` package
(no `account/` touched — that is BE-010's tree).

### 1. Per-user daily parse ceiling → 429 + Retry-After (RFC 7807)
- `ai/service/ParseQuota.kt` — in-memory calendar-day counter keyed by user, reset at **UTC midnight**.
  Fixed-window per user; map bounded by user count. `tryAcquire(userId)` returns `null` when allowed
  or the Retry-After seconds (until next UTC midnight) when over.
  ponytail: no distributed limiter — one instance, ~5 users; upgrade path noted in-file.
- Wired into `ai/controller/ParseController.kt` **before** the model call (rejects without spending tokens).
  Returns `ResponseEntity<Any>`: 200 wraps the normal `ParseResponse`, 429 builds a `ProblemDetail`
  + `Retry-After` header + `application/problem+json` — mirrors the proven AuthController magic-link 429.
  User id from `@AuthenticationPrincipal jwt` (`jwt.subject`), same pattern as EntryController/MeController.
- Limit is config: `vita.ai.daily-parse-limit` (default **50**, env `VITA_AI_DAILY_PARSE_LIMIT`).
- **Contract:** already correct — v0.3.0 specs `429 → TooManyRequests` (with `Retry-After` header) for
  `/parse/text`. No contract edit, no ADR needed. redocly exit 0.

### 2. Per-pipeline token/cost metrics (Micrometer)
- `ai/client/ClaudeClient.kt` now returns `ParseResult(output, usage)`; `extractUsage` reads the Messages
  API `usage` block (`input_tokens`/`output_tokens`), null-safe → 0 when absent (so old golden bodies
  without `usage` still pass).
- `ai/service/ParseMetrics.kt` records against the injected `MeterRegistry`, tagged **by outcome**.
- `ai/service/ParseService.kt` records once per run after the call: outcome `success` / `uninterpretable`
  (tokens counted even on the 422 branch — they were spent) / `error` (on `RestClientException`, rethrown).
- `ai/AiConfig.kt` provides a `SimpleMeterRegistry` + `Clock.systemUTC()` bean, both
  `@ConditionalOnMissingBean` (no actuator in this service). OPS-015 swaps in a Prometheus registry +
  scrape endpoint without touching pipeline code.

**Metric names (for OPS-015 / the $10 budget panel):**
- `vita.ai.parse.tokens` — counter, tags `direction=input|output`, `outcome`; incremented by token count.
  Prometheus: `vita_ai_parse_tokens_total{direction,outcome}`.
- `vita.ai.parse.requests` — counter, tag `outcome`; one per parse run.
  Prometheus: `vita_ai_parse_requests_total{outcome}`.
- No `model` tag in v1 (text parse is Haiku-only). Add when Sonnet photo/PDF parse lands.

### 3. Versioned eval set
- `src/test/resources/eval/parse-text-cases.json` — the versioned fixtures: input → expected ordered
  types, kcal tolerance (min/max), and an `expect422` case. Each carries a golden Anthropic response.
- `ai/ParseEvalCases.kt` — shared loader + `assertShape` (server-filled fields, ordered types, kcal
  tolerance). Used by both evals so they check the same expectations.
- `ai/ParseEvalTest.kt` — **CI eval**: one dynamic test per case against golden responses via WireMock
  (reuses BE-013's WireMock setup). Runs in `./gradlew check`.
- `ai/ParseLiveEvalTest.kt` — **live eval**, `@Tag("live")`, **excluded from `./gradlew check`**
  (`useJUnitPlatform { excludeTags("live") }`). On demand: `ANTHROPIC_API_KEY=… ./gradlew liveEval`.
  Skips (assumeTrue) when no key set — accidental runs are a no-op, never hit the live API in the build.

## Verification
- `./gradlew check` **green — 63 tests, 0 failures** (was 48 pre-ai; +ParseEval 4, +ParseQuota 3,
  +ParseController 2, existing ParseFlow etc.). `ParseLiveEvalTest` absent from check results (excluded).
- `npx @redocly/cli lint docs/contracts/vita-api-v0.yaml` → **exit 0**, "valid" (25 pre-existing warnings,
  none from this ticket — contract unchanged).

## Shared-file edits (for clean merge)
- `build.gradle.kts`: +`implementation("io.micrometer:micrometer-core")` (version from Boot BOM);
  Test task → `useJUnitPlatform { excludeTags("live") }`; +`liveEval` Test task (includeTags "live").
- `application.yaml`: +`vita.ai.daily-parse-limit` (2 lines incl. comment).
- `ai/ParseFlowTest.kt` (existing ai test): +`ParseMetrics(SimpleMeterRegistry())` in the `ParseService`
  ctor call (constructor gained the metrics param).

## Worktree note (for the orchestrator)
This worktree was created off `ffe880b` (round 6) — **before** BE-013 merged — so the `ai/` package the
ticket builds on wasn't present. My branch had zero unique commits and `ffe880b` is a clean ancestor of
main, so I `git merge --ff-only main` (→ `74f4547`) to get current main, then did BE-014 on top as
uncommitted working changes. Branch ref now == main; changes are ready for you to commit/merge.

## Questions for the CEO
- None. Daily limit of 50/user/day is an engineering default (abuse guard, invisible in normal use);
  tune via `VITA_AI_DAILY_PARSE_LIMIT` if desired.
