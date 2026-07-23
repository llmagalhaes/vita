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

## Needs CEO answer (or silence = default)

See the session summary — merged list, each with a default. The only cross-spec one:
**ProgramDay.kcalEstimate** (app contract-need #6 vs backend V3-D14 "program parse untouched").
Orchestrator recommendation: ADD it — optional additive schema field + one prompt line inside
BE-045; without it the Today workout summary loses its `~430 kcal` headline (handoff fidelity).
Fallback if declined: app omits the kcal line (already specced as honest-when-absent).
