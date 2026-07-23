# V3 spec reconciliation (orchestrator, 2026-07-23)

Both team specs (`backend-spec.md`, `app-spec.md`) were written in parallel. This file is the
binding resolution of every interface point where they touched or diverged. Where this file
contradicts a team spec, THIS FILE WINS; builders read their spec + this file.

## Resolved — no CEO input needed

1. **Usual persistence = backend V3-D4 (indices), NOT app contract-need #4A (doc rewrite).**
   `PlanItem.usualSwapIndex` / `PlanMeal.usualOptionIndex`, set via the existing `PUT /plan`.
   No new endpoint (satisfies the app's real wish), no data mutation: the original item and the
   full swap list stay intact, so the "ORIGINAL" restore row and Undo (= PUT the previous index)
   are trivial. **App amendments:** §2.5 `applyUsuals` writes indices (no option reorder, no
   item rewrite, no "original prepended to swaps"); "options[0] = usual by convention" is
   replaced by `usualOptionIndex`; app Q8 is closed (neither A nor B — indices).
2. **Swapped-item nutrition = backend V3-D5 equivalence math**, not the app ledger's "keep the
   original per-unit". `effectivePerUnit = base.nutritionPerUnit × base.quantity / swap.quantity`
   — total at the swap's stated quantity ≈ the original item's total (nutritionist lists are
   equalized by construction). Keeping the raw per-unit would break totals whenever quantities
   differ (banana 100g → rice 150g). `~` estimate marker as everywhere.
3. **`moreCount` dropped; the full swap list ships** (max real count 26). App derives "+N more".
   (Both specs already agreed.)
4. **No `report` object** — the report page's stated numbers land verbatim in the existing
   `dailyTotals` / per-meal & per-option `kcal` / `micros` (backend V3-D7). App reads those.
5. **No `pageCount` on the wire.** Async parse returns only a jobId; the app's findings line
   uses the `pageCount omitted` branch of `setupFindings` (already specced). Optional builder
   nicety: count `/Type /Page` in the picked file's bytes locally — not required.
6. **Async import flow (backend V3-D2) is the app's import flow.** POST /uploads → PUT bytes →
   `POST /parse/eating-plan` → 202 `{jobId}` → poll `GET /parse/eating-plan/jobs/{id}` every
   2–3 s (minutes-long; 409 = a job already running, poll that one) → `done` → `GET /plan`
   (arrives `status:"review"`). **App amendments:** §2.1/§5.1 — the app does NOT save the doc
   after parse (the server saves it as `review` at parse completion); on resolve the app
   refetches GET /plan, shows findings from the fetched doc, auto-advances 1600 ms later.
   Failure → `failureReason` feeds the §5.1.4 error card.
7. **Status lifecycle:** `review` written server-side at parse-save; `ready` written by the
   app's "Finish setup" `PUT /plan` (with the usual indices) or any manual save; `none` =
   404 on GET /plan (client-derived, never stored). Legacy docs without status read as `ready`.
8. **After any usual change, the app refetches GET /plan** — the server resets that item's
   portion override and recomputes bounds from the effective quantity (backend V3-D9).
9. **Portions endpoints unchanged**; day-scoping of the overlay is client semantics (both
   specs agree; CEO Q below only confirms the product behavior change).

## CEO decisions (2026-07-23, binding) — the sync→async resolution

The CEO first asked for a **synchronous** parse (the design already has loading animations, so
slowness is fine UX-wise). The orchestrator measured the real parse against the real API before
committing to an architecture:

- **Empirical measurement** (real `meal-plan.pdf`, real API, `claude-sonnet-4-6`, v3 tool schema):
  **158.6 s wall-clock**, 33.9k input / **13.0k output** tokens, `stop_reason: tool_use`,
  308 swaps captured, and the parse **nailed the ground truth** (dailyTotals 1716/188.6/153.4/47.9,
  5 meals, 4 options, hydration 2500, 3 supplements). Result saved as `scratchpad/parse_result.json`
  → the **golden capture** for §6.2 deterministic fixtures.
- **Infra ceiling**: our gateway is an **HTTP API v2** (`aws_apigatewayv2`, HTTP_PROXY via VPC link;
  `devops/.../modules/apigw/main.tf`) — max integration timeout **30 s, hard cap**. A 158 s sync
  request is physically impossible through it; no model generates 13k tokens in <30 s (~65 s even at
  200 tok/s). Sync-through-gateway is **ruled out by physics, not preference**.
- **CEO decision: ASYNC, confirmed.** The CEO's point ("most users' PDFs are smaller / fewer swaps")
  is handled by the SAME async path — a small plan just resolves on the first poll; no sync/async
  hybrid (two code paths, and duration is unknowable up front).
- **Mechanism = poll (backend V3-D2/D12 stands): `POST /parse/eating-plan` → 202 + `plan_parse_job`
  row → app polls `GET /parse/eating-plan/jobs/{id}` every ~3 s** while the "Reading your plan…"
  animation runs → `done` → `GET /plan` (`status:"review"`). **WebSocket REJECTED** (API-GW WS is
  separate infra; for a 5-user app the poll is the lazy equal). The tiny job row stays (not
  over-engineering — it gives the honest `failed` signal that polling GET /plan alone cannot).
- **"Notify when ready" for a backgrounded user = the v3 Home banner "Your meal plan is in"**
  (fires on `status:"review"`), already in the design, **zero new infra**. Real server push
  (FCM/APNs token registration) is **deferred to an optional phase-2 devops ticket** — not built
  this round.

## Build-round guidance (orchestrator)

- **No emulator/simulator verification this round** (CEO: "eu mesmo testo no app" — device testing is
  the CEO's). App DoD = `tsc` 0 · Jest green · `api:check` clean · `expo export` OK · fresh APK built.
  Drop every "emulator-verified" acceptance criterion; the CEO drives feel on device.
- **ProgramDay.kcalEstimate** (app contract-need #6 vs backend V3-D14): ADD it — optional additive
  field + one prompt line in BE-045; app omits the `~kcal` line when absent (honest fallback).
- **Live eval is authorized and REQUIRED** as a backend gate (real PDF end-to-end). Key from SSM
  `/vita/prod/anthropic-api-key`. ~$0.30/run.
