# ADR-0018 — Contract v0.7.0: full v3 plan model + async eating-plan parse

**Status:** Accepted — 2026-07-23 (V3 round; BE-042)

## Context

The CEO approved shipping the **complete** v3 eating-plan data model (per-meal
alternative compositions, per-item substitution lists with a persisted
"usual", supplements, hydration, plan-level notes/status) against the real
13-page nutritionist PDF (`docs/v3/design_handoff_vita_v3/meal-plan.pdf`,
private repo, used as-is — not anonymized). The build-ready spec is
`docs/v3/backend-spec.md` (ground truth for the PDF extracted in its §2);
cross-team resolutions are `docs/v3/reconciliation.md`. Previous round's
decisions (`docs/meal-plan-handover/backend-spec.md`, ADR-0017, D-1..D-11,
A1–A9) stay in force unless amended here.

Two forcing facts drove the design:

1. **Empirical measurement, real API, real PDF, v3 tool schema:** 158.6 s
   wall-clock, 33.9k input / ~13k output tokens, `claude-sonnet-4-6`. Our
   gateway is an HTTP API v2 (`aws_apigatewayv2`, HTTP_PROXY via VPC link)
   with a **hard 30 s integration timeout**. A 158 s parse is physically
   impossible through it — no model generates ~13k tokens in under 30 s
   (~65 s even at 200 tok/s). Sync-through-gateway is ruled out by physics,
   not preference.
2. The v3 product design already wants "imported-but-unreviewed" to be a
   **persisted** state (the Home "finish setup" banner survives app
   restarts) — an async parse-and-save serves both problems with one
   mechanism.

## Decision

Contract bumps **0.6.0 → 0.7.0**, additive except **one flagged breaking
change** (async parse):

1. **`POST /parse/eating-plan` becomes async** (202 + `jobId`; 409 if an
   import is already running for the user). On success the backend SAVES the
   parsed plan as the current version with `status: "review"` — the client
   polls the new `GET /parse/eating-plan/jobs/{jobId}` (states
   running/done/failed; stale-after-10-min; swept after 7 days), then
   `GET /plan`. Mechanism = poll, not WebSocket (API-GW WS is separate infra;
   for a 5-user app polling is the lazy-correct choice; the tiny job row is
   what gives an honest `failed` signal that polling `GET /plan` alone
   cannot). `/parse/training-program` and every other path are unchanged —
   coach PDFs haven't hit the size wall and the v3 design has no `review`
   state for programs.
2. **`EatingPlanDraft` gains `status` (`ready`|`review`, absent = `ready`),
   `note`, `hydration`, `supplements`.** No status endpoint — status rides
   the existing POST/PUT/GET; the app flips `review`→`ready` via the
   "Finish setup" `PUT /plan`. Supplements/hydration are transcription only;
   turning an accepted supplement into a local habit is app-side (habits are
   device-local — the backend has no habit store, same architecture as
   check-ins).
3. **`PlanMeal` gains `kcal`, `note`, `options` (`MealOption[]`,
   `usualOptionIndex`).** A meal's own `items` are its default composition;
   each `options[k]` is a wholesale alternative composition ("Opção 2 —
   Brunch") with its own full item list. Choosing a usual composition is a
   doc field (`usualOptionIndex`), set via the existing `PUT /plan` — **no
   new endpoint**; undo = PUT the previous value.
4. **`PlanItem` gains `grams`, `swaps` (`SwapOption[]`, up to 40),
   `usualSwapIndex`.** Swaps carry the substitution list in document order
   (this real plan runs up to 26 per item) with **no nutrition fields at
   all** — `{name, quantity?, unit?, grams?}` only. Choosing a usual swap is
   likewise a doc field via `PUT /plan`, not a new endpoint.
5. **Item ids now flatten across options too**: document order = each meal's
   own `items` first, then `options[0].items`, `options[1].items`, … (same
   save-time-only assignment rule as ADR-0017, A2 — no backfill). This real
   PDF yields `it-1…it-42`.
6. **Portion bounds and the A5 overlay-edit rule (ADR-0017) now key off the
   item's EFFECTIVE quantity/unit**: the usual swap's `quantity`/`unit` when
   `usualSwapIndex` is set, else the item's own. Changing a usual therefore
   resets that item's portion override and recomputes its bounds at save —
   same mechanism as any other quantity/unit edit, just triggered a second
   way.
7. **`ProgramDay.kcalEstimate`** (optional number) — a reconciliation add
   beyond backend-spec §1: the app's Today workout tab shows a `~{kcal}`
   line per day; absent → the app omits it. Training-program parse otherwise
   untouched this round.
8. **No separate `report` object.** The nutritionist's report-page numbers
   (per-meal/option kcal, daily totals, micros) land in the *existing*
   fields, with an amended `dailyTotals` description: stated numbers are
   **transcribed verbatim**, not re-estimated, when the document has a
   report page. One field per fact — a `report` object would duplicate
   `dailyTotals` byte for byte.
9. **`moreCount` is NOT on the wire** — the full swap list ships; the app
   derives "+N more" client-side. Derivable data never goes on the wire.
10. **Swaps carry no nutrition estimates.** When a swap is the chosen usual,
    its macros derive app-side from nutritionist equivalence:
    `effectivePerUnit = base.nutritionPerUnit × base.quantity / swap.quantity`
    (a substitution at its stated quantity is, by construction, equivalent to
    the original item's total) — labeled an estimate like everything else.
    Per-swap Claude estimates would run 3–4× the output tokens (cost and
    parse time) for numbers the nutritionist already equalized.
11. **Async job = its own table (`plan_parse_job`, migration V009), not the
    generic job queue**, and runs in-process (`@Async`, fixed pool of 2 to
    cap concurrent Claude spend). The row holds state only — no input, no
    result (the result IS the saved plan) — so nothing sensitive is ever
    written to it. An instance dying mid-parse leaves the row `running`;
    polling reports it `failed` after the 10-minute stale window and the
    user retries the import. `// ponytail:` marks the no-durable-retry
    ceiling at the call site; the upgrade path is the generic queue if we
    ever need durable retries.
12. **Separate token/timeout knobs for the async path**
    (`plan-async-max-output-tokens: 16384`, `plan-async-timeout-seconds: 300`)
    — sync paths (photo capture, program parse) keep the existing
    `plan-max-output-tokens: 3072` / 25 s, where the cap doubles as a latency
    guard inside the gateway's 29 s. 16384 stays under the ~21k
    non-streaming Messages-API ceiling, so no streaming is needed.
13. **Parse transcribes in the document's own language** — no translation
    layer. This PDF is pt-BR; item names, notes, dose/timing strings come
    back pt-BR.
14. **Fold-in fix (18b review):** `PUT /plan/portions` with a JSON `null`
    value (`{"it-1": null}`) currently NPEs to 500; the controller now binds
    `Map<String, Double?>` and rejects any null value with 400 — the contract
    already documented 400 for bad values, this was a code bug, not a
    contract change.

**Storage note:** the entire v3 model lives inside the existing encrypted
`eating_plan` doc blob (ADR-0017's A1/A3 stand: the doc is already one opaque
encrypted JSON the server never aggregates). Zero new columns on
`eating_plan`; `plan_parse_job` is the only new table, and it is state-only
(no plan content, no PII — see point 11).

## Consequences

- App updates in lockstep with the async parse-import flow (pre-prod, single
  consumer — no versioned rollout needed). Import flow becomes:
  `POST /uploads` → PUT bytes → `POST /parse/eating-plan` (202) → poll
  `GET /parse/eating-plan/jobs/{id}` → `GET /plan` (`status:"review"`).
- redocly lint: valid, exit 0 (only the pre-existing operationId style
  warnings shared by every path in the file — unchanged pattern from
  ADR-0017).
- Implementation lands in BE-043 (doc model + save semantics + the portions
  null-guard fix), BE-044 (async job: V009, worker, 202/409/poll/stale/sweep),
  BE-045 (tool schema + prompt deltas, async knobs, live real-PDF eval,
  golden fixtures), shipped by BE-046 via a Terraform `app_image_tag` apply
  (no CLI task-def clones — the OPS-024 pattern).
- Real-Anthropic-API live eval against the exact committed PDF is CEO-
  authorized and required as a backend gate this round (~$0.30/run,
  `@Tag("live")`, excluded from `check`); acceptance bar is "importing THIS
  PDF works perfectly" against the ground-truth table in backend-spec §2.
- Ceiling carried over from ADR-0017: positional `it-N` identity is weak
  under heavy reordering by old clients — acceptable pre-launch, unchanged
  this round.
