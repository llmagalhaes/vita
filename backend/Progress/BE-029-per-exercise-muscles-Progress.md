# BE-029 — Per-exercise muscles (contract + parse)

Asana: BE-029 (board "Vita backend"). CEO un-gated the app's per-exercise muscle-tinting ask.
Additive contract change; the app team is NOT touching the contract this session (backend owns it).

## Session 14 (2026-07-15) — done locally

### Contract (`docs/contracts/vita-api-v0.yaml`) — **v0.4.0 → v0.5.0**
- Added optional `muscles: array<enum>` to the `Exercise` schema — the SAME 11-silhouette closed
  vocabulary as `WorkoutDetail.muscles`. Additive; `WorkoutDetail.muscles` unchanged (back-compat).
- Bumped `info.version` to 0.5.0 + a changelog line. redocly lint: valid (36 pre-existing warnings).

### Implementation (shortest additive diff, reuse only)
- `model/entries/EntryDetail.kt`: `Exercise` gains `muscles: List<String>? = null`.
- `service/entries/EntryService.kt`:
  - Extracted the existing workout-level muscle mapping into `mapMuscles(List<String>?)`
    (dedup — the workout branch now calls it too).
  - Workout `normalize` now maps each exercise's `muscles` through the same `mapMuscle` vocabulary
    (aliases folded, unmappable dropped) via `mapMuscles`. Kept the workout-level field.
- `service/ai/ClaudeClient.kt`: extended the `record_log_entries` tool's `NUTRITION_PREAMBLE`
  exercise shape to include `"muscles"?: ... from the same list`. Tool `input_schema` is untouched
  (detail is a free-form object there — the vocabulary lives in the preamble text, as before).

### Tests
- New `EntryFlowTest` case: per-exercise `["chest","triceps","banana"]` → stored/returned
  `["chest","triceps"]` (banana dropped). Mirrors the existing workout-level muscle test.
- `./gradlew check` green — **124 tests** (was 123; +1), detekt+ktlint clean, redocly exit 0.

### Ships in a later image
Task 1's pushed image (`a03e194`) predates this change (built from committed state first, per the
sequencing rule). This change is in the working tree, uncommitted; it goes out in the next image the
orchestrator commits + devops redeploys.

### Notes
- ktlint↔detekt conflict on the one-liner `mapMuscles` (ktlint wanted it on the signature line,
  detekt's MaxLineLength rejected that) → used a 2-line block body. Green both ways.
