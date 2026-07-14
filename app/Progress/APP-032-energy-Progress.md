# APP-032 — Energy (slice 7, F12) — Progress

**Asana:** APP-032 (Vita frontend `1216519867368576`) — "spent = sum of logged workout kcal (labeled estimate) + a manual add with dual input, written as a manual workout entry via the existing confirm/outbox path — NO new endpoint or shape. Health-source part shows Connect a health source."
**Backend gate:** none (D8).

## What was built

### `src/energy/manual.ts`
- `parseBurned(text)` — pure: "burned 300", "burnt 450 kcal", "spent 200 calories" → kcal, else null.
- `manualEnergyEntry(kcal)` — a `workout` `NewEntry` carrying **kcal and `exercises: []`** (no new endpoint, no new shape — D8), `isEstimate: true`.
- `logManualEnergy(kcal)` — writes it via `addLocalEntry` (the existing outbox path).

### Home energy card (`app/(main)/home.tsx`)
- **"Spent" is now real**: sum of today's **logged workout kcal** (D8), labeled an estimate — replaces the hardcoded 0. Flows into the in/out bars and, via `aggregateDays`, into Trends.
- **Manual add with dual input** in the expanded energy section: a numeric field ("type a number") + Add → `logManualEnergy`. The **voice path** ("burned 300" to the pill) is handled by `mockParse` — it now emits the same workout-with-kcal draft, so it rides the existing capture → confirm → outbox flow.
- Health-source energy stays honest: no fabricated "out" number; the copy points at logging / a connected source.

## Tests — `src/energy/__tests__/manual.test.ts`
`parseBurned` cases; `manualEnergyEntry` is a workout with kcal and no exercises (labeled estimate); `logManualEnergy` writes locally **and enqueues on the existing outbox**. 3 tests.

## Gates
`tsc` clean · `jest` green · `api:check` no drift · `expo export` iOS OK · SDK 56.

## ponytail
- Reused the workout entry shape for manual energy — zero new contract/endpoint (D8). Voice "burned N" folded into the existing `mockParse` branch, so both inputs share one write path.
