# BE-032 — Live-verify pinned Claude model ids (PDF/photo import)

Asana: Vita backend board `1216519867368580` (ticket BE-032).
ADR: `Doc/ADRs/ADR-0005-claude-api-usage.md` → "Live re-verification (BE-032, 2026-07-15)".

## Why
Root handover flagged a long-standing risk: `vita.ai.plan-pdf-model` / `vita.ai.photo-model =
claude-sonnet-4-6` might be stale/wrong, with `claude-sonnet-5` being "the current Sonnet". The
CEO is shipping PDF + photo import hitting PROD Claude for real — a bad id would 4xx/5xx.

## What I did
1. Loaded the claude-api reference (skill) for current ids + thinking-mode rules — did not answer
   from memory.
2. Live-checked each configured id against the **real Anthropic API** (key from gitignored
   `secrets.yaml`, never logged):
   - `GET /v1/models/claude-haiku-4-5` → 200 "Claude Haiku 4.5"
   - `GET /v1/models/claude-sonnet-4-6` → 200 "Claude Sonnet 4.6"
   - `GET /v1/models/claude-sonnet-5` → 200 "Claude Sonnet 5"
   All three resolve. **`claude-sonnet-4-6` is a real, active model — the suspicion is a false alarm.**
3. Live `POST /v1/messages` replicating the exact `parsePhoto` path against `claude-sonnet-4-6`:
   native base64 image block + `record_log_entries` tool, `tool_choice` forced, **no `thinking`
   param**, `max_tokens: 2048`. Result: `stop_reason: "tool_use"`, one `tool_use` block, **no
   `thinking` block**. → thinking is off by default when the param is omitted, and the forced-tool
   call is NOT truncated (never `max_tokens`). Confirms both vision capability and the ADR's
   thinking-off rationale.

## Outcome
- **No config change, no `ClaudeClient` change.** The pinned ids are correct as-is.
- `claude-sonnet-5` stays deferred: it defaults adaptive thinking ON, which would share the
  2048-token forced-tool budget → truncation risk, exactly as ADR-0005 warns. Switching would
  require a `thinking: {type:"disabled"}` (or larger `max_tokens`) code change first.
- ADR-0005 pinned-models table updated with the live-verification note (which id, what call, what
  it returned; key redacted).
- `./gradlew check` green — **148 tests, 0 failures** (unchanged; no code touched).

## Redeploy?
**NO.** Prod (image `909262c`) already runs these exact ids (live since session 8). PDF/photo
import will not break on account of model ids. This ticket triggers no image rebuild; the ADR/ledger
doc update rides the next commit whenever it happens.
