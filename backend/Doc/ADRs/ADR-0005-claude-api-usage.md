# ADR-0005 — Claude API usage: zero-retention, drafts-only, tiered models, capped cost

**Status:** Accepted — 2026-07-13 (CEO decisions, Round 3 #3 and #5)

## Context

Product AI (text/photo parse, plan/program import) sends user content to the Claude API. Product philosophy: no advice; the backend records what the user confirmed. Budget: $10/mo for the Claude API.

## Decision

- **Zero-retention arrangement** on the Vita API key (CEO-confirmed with Anthropic).
- **No user identifiers in prompts** — no email, name, or user id ever leaves for the API; user text is data inside the prompt, never instructions.
- **Drafts only — the AI never writes to the log.** Parse endpoints are stateless transformations to a draft entry; only the user's Confirm hits the ordinary entries endpoint. Unconfirmed drafts are structurally unpersistable (no persistence dependency in the parse path). The tool-forced output schema has no free-text commentary field — nowhere to put advice.
- **Model tiering:** Haiku-class for text parse; Sonnet-class (vision) only for photos and PDF import. Model ids in config; prompt caching on the system/nutrition preamble; capped output tokens; single call, no agentic loops.
- **Cost controls:** per-user daily parse ceiling (abuse guard, invisible in normal use); per-pipeline cost metrics; **budget alarm at $10/mo**.

## Consequences

- On timeout/failure the app falls back to manual entry — no retry loops burning budget.
- Estimates are labeled as estimates end to end; no food-database verification in v1 (recorded non-goal).
- A small versioned eval set guards against prompt/model regressions (golden responses in CI, live API on demand).

## Pinned model ids (BE-023 2026-07-14; re-verified live BE-032 2026-07-15)

| Config key | Model id | Tier / why |
|---|---|---|
| `vita.ai.model`, `vita.ai.plan-model` | `claude-haiku-4-5` | Haiku-class text parse; confirmed working. |
| `vita.ai.plan-pdf-model` | `claude-sonnet-4-6` | Sonnet-class native PDF; **thinking-off by default** — the 2048-token tool-forced call needs the whole budget for the tool call (`claude-sonnet-5` turns adaptive thinking on by default and would share it, risking truncation). |
| `vita.ai.photo-model` | `claude-sonnet-4-6` | Sonnet-class vision for photo parse (BE-018/F3); same thinking-off rationale. |

Same-tier upgrade (`claude-sonnet-5`) is deferred: it needs a `thinking: {type: "disabled"}` (or larger `max_tokens`) code change in `ClaudeClient` before the budget-capped forced-tool path is safe — out of scope.

### Live re-verification (BE-032, 2026-07-15)

The flagged risk ("`claude-sonnet-4-6` looks stale/wrong; current Sonnet is `claude-sonnet-5`") was checked against the **real Anthropic API** (key from gitignored `secrets.yaml`, never logged):

- **`GET /v1/models/{id}`** — `claude-haiku-4-5` → 200 "Claude Haiku 4.5"; `claude-sonnet-4-6` → 200 "Claude Sonnet 4.6"; `claude-sonnet-5` → 200 "Claude Sonnet 5". All three are live, active ids. **The suspicion is a false alarm — `claude-sonnet-4-6` is not stale.**
- **Live `POST /v1/messages`** replicating the exact `parsePhoto` path (native base64 image block + `record_log_entries` tool, `tool_choice` forced, no `thinking` param, `max_tokens: 2048`) against `claude-sonnet-4-6` returned `stop_reason: "tool_use"` with a `tool_use` block and **no `thinking` block** — i.e. thinking is off by default when the param is omitted, and the forced-tool call is **not** truncated (`stop_reason` is `tool_use`, never `max_tokens`). This confirms both the vision capability and the thinking-off rationale for the PDF/photo path.

**No config or `ClaudeClient` change made** — the pinned ids are correct as-is; PDF/photo import will not 4xx/5xx in prod on account of model ids. `claude-sonnet-5` stays deferred for the reason above.
