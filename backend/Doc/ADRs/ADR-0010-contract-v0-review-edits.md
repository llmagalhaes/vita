# ADR-0010 — Contract v0 app-review edits (0.1.0 → 0.2.0)

**Status:** Accepted — 2026-07-13

## Context

ADR-0006 requires an ADR for any contract change. The app team reviewed
`docs/contracts/vita-api-v0.yaml` (APP-001, `app/Doc/contract-review-v0.md`):
approved, with two schema edits requested and one addition declined.

## Decision

Applied in version 0.2.0:

- **`WorkoutDetail.muscles`** is now a closed 11-value enum (`chest, back,
  shoulders, biceps, triceps, forearms, core, glutes, quads, hamstrings,
  calves`) — exactly the app's body-map silhouettes. Backend maps model
  output onto the list and drops the unmappable ("lats"/"traps" → `back`,
  "abs"/"obliques" → `core`).
- **`ParseResult.drafts`** gains `maxItems: 5` so the app's stacked
  confirmation cards stay bounded; the model merges or drops beyond that.
- **`?updatedSince=` delta sync: declined for v0** (app refreshes by day,
  infers deletes from omissions). Revisit with tombstones only if
  multi-device becomes real.

Resolved `TBD-APP-REVIEW` markers were replaced with the review's answers
(no schema impact). No other shape changed.

## Consequences

- Both teams build waves 0–2 against 0.2.0; redocly lint stays green.
- Parse implementation (BE-013) owns the muscle-mapping and draft-cap rules.
