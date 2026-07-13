# BE-013 — Claude client + POST /v1/parse/text (drafts only)

Asana: Vita backend board `1216519867368580` (task BE-013). Status: **In progress**.
ADR-0005 (Claude API usage), contract `docs/contracts/vita-api-v0.yaml` `/parse/text`.

## What was built (new `ai/` package)

- `ai/client/ClaudeClient.kt` — single tool-forced Claude call. Haiku-class model
  (`claude-haiku-4-5`), model/base-url/timeout/max-tokens from config, key from
  `keys.anthropic`. Prompt caching (`cache_control: ephemeral`) on the system +
  nutrition preamble; capped output tokens (1024); ~10 s read timeout (3 s connect)
  with **one retry**. Tool `record_log_entries` forces the output shape
  (`drafts[]` of `{type, occurredAt, detail}`, `maxItems: 5`) — no free-text
  commentary field, so there is nowhere to put advice. Returns `null` when the
  model produces no usable tool call or unparseable output.
- `ai/service/ParseService.kt` — stateless rules: fills the deterministic contract
  fields server-side (`inputMethod=text`, `isEstimate=true`, `sourcePhrase`=the
  user's words), validates `type` against {meal,water,workout}, drops unusable
  drafts, caps at 5, and **anchors a missing/mangled `occurredAt` to `capturedAt`**.
  Empty result → **422** (`ResponseStatusException`).
- `ai/controller/ParseController.kt` + `ParseDtos.kt` — `POST /v1/parse/text`,
  validates `text` (1–2000, non-blank → **400** otherwise), defaults `capturedAt`
  to now. Response = contract `ParseResult` (`drafts[]` shaped exactly like the
  `/entries` NewEntry body). Auth is enforced by the existing SecurityConfig
  (`anyRequest().authenticated()`); no security change needed.

Nothing is persisted server-side (ADR-0005). No user identifier goes to the API;
the user text is delimited data (`<user_note>` tags), never instructions
(prompt-injection safe).

## Tests

`ai/ParseFlowTest.kt` — 6 integration tests against **WireMock golden responses**
(no live API): happy path (meal+water, server fields, contract shape), text-only →
422, empty drafts → 422, missing `occurredAt` anchored to `capturedAt`, `maxItems`
cap at 5, and 5xx retried once → success (verifies exactly 2 upstream calls).
`./gradlew check` green — **13/13 tests** (7 pre-existing + 6 new); redocly exit 0.

## Design notes / deviations

- **ponytail:** used Spring's already-present `RestClient` for the single stateless
  Messages-API call instead of adding the Anthropic Java SDK — a multi-MB dependency
  is not justified for one endpoint in a cost-first, 5-user service. `base-url` is
  configurable so tests point it at WireMock.
- **Worktree base mismatch (flagged to orchestrator):** this worktree branched from
  round 6 (`ffe880b`) — it has NO `crypto/`, NO real auth (the `JwtAuthFilter` here
  validates nothing), NO `entries/`/`NewEntry`, and Jackson 2 on the module path
  (Boot 4 MVC still serializes with Jackson 3). The task assumed the later state
  (BE-005/006/008/011 merged). Consequences:
  - The `ai/` package is fully **self-contained** — its own `Draft` DTO matching the
    contract NewEntry, no dependency on `entries/`. Merges additively into `main`.
  - Kept the model `occurredAt` as a String parsed in the service (no
    `jackson-datatype-jsr310` on this classpath) and pinned the wire name of the
    boolean with `@JsonProperty("isEstimate")` — both Jackson-version-agnostic.
  - No full-HTTP authenticated happy-path test is possible in this worktree (no
    working JWT validation here), so the WireMock suite exercises the parse flow at
    the ClaudeClient+ParseService boundary. On merge into `main` (real oauth2
    resource server), the endpoint is already protected by `anyRequest().authenticated()`.

## Shared-file edits (for clean merge)

- `build.gradle.kts`: `testImplementation("org.wiremock:wiremock-standalone:3.9.1")`
  (shaded — no Jackson clash).
- `application.yaml`: `spring.mvc.problemdetails.enabled: true`; new `vita.ai.*`
  block (`model`, `base-url`, `max-output-tokens`, `timeout-seconds`); `keys.anthropic`.
- No edit to `VitaApiApplication.kt` (config read via `@Value`, no
  `@ConfigurationPropertiesScan` needed).

## Model id used

`claude-haiku-4-5` (current Anthropic Haiku, per the claude-api reference).

## Questions for the CEO

None new. (Per-user daily parse ceiling / $10 budget alarm from ADR-0005 are
infra/observability concerns — a devops ticket, not this endpoint.)
