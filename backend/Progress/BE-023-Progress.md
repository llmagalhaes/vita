# BE-023 — Verify & pin AI model ids

Asana: Vita backend board (`1216519867368580`), ticket BE-023 (was "To do").
Slice 8 "Tech debt & real adapters"; gates F3 (photo) / F4 (plan PDF).

## What / why

Verified the Claude model ids in `application.yaml` against the claude-api
reference (skill) before pinning — the ticket flagged
`vita.ai.plan-pdf-model = claude-sonnet-4-6` as "looks wrong".

**Finding: it is not wrong.** `claude-sonnet-4-6` is a valid, Active model with
native PDF + vision input. It is the deliberate ADR-0005 Sonnet-class choice and
— crucially — runs **thinking-OFF by default**, which the 2048-token, tool-forced
plan/PDF call in `ClaudeClient` relies on. The current-gen `claude-sonnet-5`
turns adaptive thinking on by default and would share that 2048-token budget with
the forced tool call, risking a truncated (→ 422) tool output. Moving to
sonnet-5 would first need a `thinking: {type: "disabled"}` (or larger max-tokens)
change in `ClaudeClient` — out of scope for an S-sized verify/pin ticket.

## Pinned ids (all verified against the reference)

| Config key | Model id | Tier / reason |
|---|---|---|
| `vita.ai.model`, `vita.ai.plan-model` | `claude-haiku-4-5` | Haiku-class text parse; confirmed working. Unchanged. |
| `vita.ai.plan-pdf-model` | `claude-sonnet-4-6` | Sonnet-class native PDF; thinking-off default suits the budget-capped forced-tool call. Unchanged (verified correct). |
| `vita.ai.photo-model` | `claude-sonnet-4-6` | **NEW** — Sonnet-class vision for BE-018 photo parse (F3), per ADR-0005 ("vision only for photos and PDF"). |

`photo-model` is the config surface BE-018 needs; `ClaudeClient.callTool(model, …)`
already takes the model per-call, so no client field was added (BE-018 injects
`vita.ai.photo-model` where it builds the vision call — no unused plumbing now).

## Files changed

- `backend/services/vita-api/src/main/resources/application.yaml` — added
  `vita.ai.photo-model`; expanded the model-tiering comment with the verified
  ids + the thinking-off rationale.
- `backend/Doc/ADRs/ADR-0005-claude-api-usage.md` — added a dated "Pinned model
  ids (BE-023)" table + the sonnet-5 deferral note.

## DoD

- `./gradlew check` green — **89/89 tests**, detekt + ktlint clean (no code
  change here; BE-017 in the same session added the 5 new tests).
- No contract change from BE-023 (config + docs only).

## Follow-ups

- BE-018 (photo) reuses `ClaudeClient.callTool` with `vita.ai.photo-model`;
  same budget-capped forced-tool pattern, so the thinking-off Sonnet-4.6 pin
  carries over.
- **Question for CEO (cost):** photo parse defaults to Sonnet-class
  (`claude-sonnet-4-6`) for food-photo quality per ADR-0005. If the $10/mo
  Claude budget alarm (OPS-015) fires, `VITA_AI_PHOTO_MODEL=claude-haiku-4-5`
  is a cheaper vision-capable fallback (env override, no code change).
- Same-tier upgrade to `claude-sonnet-5` deferred until `ClaudeClient` disables
  thinking on the forced-tool path (own ticket if/when desired).
