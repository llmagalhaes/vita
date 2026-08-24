# BE-060 + BE-062 — the two seeded reference tables (v4.2, Wave 1)

**Status:** built, gates green. `./gradlew check` **BUILD SUCCESSFUL — 300 tests, 0 failures**
(23 of them new, in `com.llmagal.vita.estimate`). Ran once, first try, no contention retry needed.

## What shipped

| File | What |
|---|---|
| `backend/tools/gen_seed_migrations.py` | One-off **dev** script (never on the classpath). Downloads both datasets, converts, writes V013 + V014. Deterministic — re-running produces no diff, so Flyway checksums stay stable. |
| `src/main/resources/db/migration/V013__food_tables.sql` | `pg_trgm` + GIN index, `food` / `food_alias` / `food_estimate_cache`, **590 TACO rows + 66 aliases as INSERTs**. |
| `src/main/resources/db/migration/V014__exercise_tables.sql` | `exercise` / `exercise_muscle` / `exercise_alias` / `exercise_estimate_cache`, **915 exercises + 2534 muscle rows + 53 aliases**. |
| `src/main/kotlin/…/service/estimate/NameNorm.kt` | The single lookup key. Shared by both lookups. |
| `src/main/kotlin/…/service/estimate/FoodLookup.kt` | exact → alias → trigram ≥ .45; unit → grams; `round5` (shared with BE-061). |
| `src/main/kotlin/…/service/estimate/ExerciseLookup.kt` | Same order, returns family / wholeBody / muscleRoles. |
| `src/test/kotlin/…/estimate/{FoodLookupTest,ExerciseLookupTest}.kt` | 13 + 10 tests, Testcontainers, **no network**. |
| `Doc/ADRs/ADR-0020-…md` | Decision 9 extended with the licence text as actually re-read at import, plus the one deviation. |

## Seed counts

- **food 590** (TACO ships 597; 6 rows publish no energy value — `"*"`/`"NA"` — and 1 name duplicates) + **66 aliases**.
- **exercise 915** = **46 EXCAT** + **869 free-exercise-db** (873 rows, 4 lost to name collisions **won by EXCAT**, which is inserted first against a unique `name_norm`) + **53 aliases**, **2534 muscle rows**.

## Licence, re-read at download time (2026-08-24)

- **TACO** via `github.com/marcelosanto/tabela_taco`. The mirror ships **MIT** ("Copyright (c) 2023
  Marcelo Santos") — but that is *his* grant over *his* repository, not NEPA/UNICAMP's over the table.
  **The table itself still carries no explicit redistribution licence.** ADR-0020 decision 9 stands:
  ship now, settle before the store. Per-row `source='taco-4'`, `source_ref='taco4:<id>'`.
- **free-exercise-db**: **The Unlicense** — public-domain dedication, no attribution, no share-alike.
  Confirmed three ways (GitHub SPDX `Unlicense`, `LICENSE.md` text, README badge). Nothing to settle.
- **wger** was never downloaded; the CC-BY-SA rejection stands on licence type alone.

## Deviations (all reported, none silent)

1. **`exercise_alias` table added** (not in the plan's §2.4 shape list). Taken under ADR-0020's own rule
   that the lever is aliases, never a lower threshold. Two reasons found only at import: both seeds are
   **entirely English**, and free-exercise-db has **no "Bulgarian" row at all** — nearest "Split Squats"
   scores **0.435** vs "bulgarian split squat", just under the 0.45 floor. 53 curated aliases close both.
2. **EXCAT is 46 entries, not 47.** The handoff §3.4 header says "Por tempo (24)" but lists 23; 23 set +
   23 time = 46. No entry is missing — the arithmetic in the doc is off by one.
3. **No plpgsql `normalize()` function.** The generator precomputes `name_norm` with the same rules and
   lookups normalize in Kotlin, so a second implementation would only be a second thing to keep in sync.
   The guard is a test that re-derives **every** seeded `name_norm` through `NameNorm.of` — drift fails
   the build, which a plpgsql twin never would.
4. **Leading-quantity stripping is digits-only and runs once.** Stripping word-numbers collapsed
   "One-Arm Kettlebell Row" onto "Two-Arm Kettlebell Row"; looping collapsed "3/4 Sit-Up" onto "Sit-Up".
5. **Negative carbs clamped to 0.** TACO computes carbohydrate by difference; 4 rows round to −0.03.
6. **No milk alias.** This TACO edition publishes no energy for whole/skimmed UHT milk. Pointing "leite"
   at the *powder* row would be a wrong answer the table would never re-ask, so it misses to the model.

## Notes for BE-061 / BE-063

- `FoodLookup.round5()` is the shared rounder — apply it to model answers too, don't re-implement.
- `FoodLookup.THRESHOLD` is a `const`, deliberately **not** a config knob (ADR-0020 forbids lowering it).
- Both lookups log their seed size at `ApplicationReadyEvent` (`seed table=food rows=… aliases=…`) —
  that is the line BE-064's prod probe should grep for.
- Neither writes to the `*_estimate_cache` tables; that is BE-061/BE-063's leg.
