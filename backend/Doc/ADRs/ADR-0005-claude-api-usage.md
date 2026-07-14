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

## Pinned model ids (BE-023, 2026-07-14)

Verified against the claude-api reference before pinning:

| Config key | Model id | Tier / why |
|---|---|---|
| `vita.ai.model`, `vita.ai.plan-model` | `claude-haiku-4-5` | Haiku-class text parse; confirmed working. |
| `vita.ai.plan-pdf-model` | `claude-sonnet-4-6` | Sonnet-class native PDF; **thinking-off by default** — the 2048-token tool-forced call needs the whole budget for the tool call (`claude-sonnet-5` turns adaptive thinking on by default and would share it, risking truncation). |
| `vita.ai.photo-model` | `claude-sonnet-4-6` | Sonnet-class vision for photo parse (BE-018/F3); same thinking-off rationale. |

Same-tier upgrade (`claude-sonnet-5`) is deferred: it needs a `thinking: {type: "disabled"}` (or larger `max_tokens`) code change in `ClaudeClient` before the budget-capped forced-tool path is safe — out of scope for BE-023.
