# ADR-0020 — Contract v0.9.0: hand-built plans and programs, and hybrid kcal/muscle estimation

**Status:** Accepted — 2026-08-24 (v4.2 round; BE-057)

## Context

The CEO's Claude-Design handoff v4.2 (`docs/v4.2/HANDOFF_v4.2_manual_setup.md`)
adds two manual builders to the app: an eating plan you type in by hand instead
of importing a nutritionist's PDF, and a training program you write day by day.
The reconciliation (`docs/v4.2/PLAN.md`, binding) and the backend plan
(`docs/v4.2/backend-plan.md`) were approved with **CEO Round 16** answering all
five open questions — including one change to the handoff (answer 4: a
hand-built training day keeps its `~kcal` line).

Three facts shaped this round:

1. **A hand-built plan is not a new kind of plan.** It is the same document a
   PDF parse produces, minus swaps and options. Every persistence concept it
   needs — versions, `m-N`/`it-N` ids, portion bounds, per-user encryption,
   history capped at 5 — already exists and already works.
2. **The screens ask for two fields the document cannot hold.** A per-item kcal
   *total* (the builder's own number, typed or estimated) and an exercise
   measured in *minutes*. Neither has anywhere to go in 0.8.0.
3. **"Fill in the calories for me" cannot mean "ask Claude for everything."**
   The CEO's Round-16 answer is a hybrid: our own seeded reference table first,
   a cache second, the model only for what both miss.

## Decision

Contract bumps **0.8.0 → 0.9.0** — additive except **D1**, which is a
relaxation (an old client's documents all still validate). Nine deltas:

| # | Surface | Change |
|---|---|---|
| D1 | `PlanMeal.items` | `minItems` 1 → 0 |
| D2 | `PlanItem.kcal` | number ≥ 0 — total for the stated quantity |
| D3 | `PlanItem.kcalEstimated` | boolean — the estimate label; without `kcal` → 400 |
| D4 | `Exercise.durationMin` | integer ≥ 1 — the time family's minutes |
| D5 | `Exercise.wholeBody` | boolean — "the split is a guess" |
| D6 | muscle enums ×3 (+ `Muscles.VOCAB`) | add `traps`; drop the `traps → back` alias |
| D7 | `POST /v1/estimate/food-kcal` | new |
| D8 | `POST /v1/estimate/exercise-muscles` | new |
| D9 | `POST /v1/estimate/workout-kcal` | new (CEO Round 16 answer 4) |

1. **Hand-built plans and programs ride the existing save paths.** `POST /v1/plan`
   and `POST /v1/program`, byte-for-byte the same request bodies an import
   produces. No `/plan/manual`, no `source` discriminator, no second write path
   to keep in sync — the server already cannot tell, and should not care, where
   a document came from. Consequences it inherits, deliberately: **POST is
   destructive by design** (new current version, oldest of 6 evicted, portion
   overlay cleared — so the app saves once at "Finish setup" and never
   autosaves), the plan is born `ready` and never passes through `review` (the
   review already happened, on the builder's own screen), and fresh `it-N`/`m-N`
   ids mean day records pointing at the previous plan go stale exactly as
   ADR-0019 risk 1 describes — past days still render from their own copies.
   D1 exists because the builder lets a named slot exist before its food does;
   the precedent is 0.8.0 relaxing `MealDetail.items` for a skipped meal.

2. **Per-item kcal is a TOTAL, not per unit.** `PlanItem.nutritionPerUnit`
   already carries per-one-gram/one-unit macros and is unchanged; `PlanItem.kcal`
   is the number for the item **at its stated quantity** — 60 g of oats is one
   `kcal: 235`. Encoding it as `kcal/quantity` would store a float nobody typed
   and destroy exactly the roundness the handoff insists on ("a `237` suggests a
   precision the estimate does not have"). The server does **no** nutrition math
   on the save path — it stores what the client sends, as it already does for
   `dailyTotals` and `PlanMeal.kcal`.

3. **The estimate label persists with the number.** `kcalEstimated` is stored in
   the plan document and returned on every read, so `~235` renders as an
   estimate on every surface that shows it, forever — not only on the screen
   that produced it. This is the product constitution ("estimates labeled as
   estimates"), not a UI preference, which is why it is a wire field and not
   app-local state. `kcalEstimated` without `kcal` is a **400**: there is no
   estimate to label.

4. **The EXCAT → vocabulary translation lives app-side.** The handoff's exercise
   catalog is keyed by the app's own 10 body-map keys and carries **weights**;
   the wire speaks the closed `Muscles.VOCAB` and carries **roles**. The
   translation is the inverse of the app's existing `KEY_OF` map and belongs
   next to it, in the app — the backend never sees a weight. Role from weight
   uses the **CEO Round-15 cut: `w ≥ .7` → `primary`, else `secondary`** — the
   same `.7` as `tierOf`, so the builder's live map, the session badge and
   Trends can never disagree about what "primary" means.

5. **`traps` becomes a real muscle** (D6). It folded into `back`, which
   permanently deleted a distinction the app has both a chip and a silhouette
   for (face pull, deadlift) — the chip could never light. One value added to
   the vocabulary, one alias dropped. Additive on the wire: pre-0.9.0 clients
   simply never receive it. **And the program save path now normalizes**: only
   the *parse* path called `Muscles.normalize()`, so a client typo would be
   stored verbatim inside an encrypted blob nobody can grep. `POST/PUT /program`
   now runs every exercise through the same normalizer — one chokepoint closing
   the hand-built, the imported and the estimate-fallback paths at once.

6. **Estimation is table → cache → Claude, misses only** (CEO Round 16). One
   lookup order for both domains: normalized exact match → alias → trigram fuzzy
   (`pg_trgm`, threshold 0.45) → estimate cache → the model, batched into **one**
   call for the whole pass. A table hit costs nothing and answers in
   milliseconds; a pass the table answers in full makes **zero** outbound calls.
   Seeds ship as SQL inside the migration (Flyway already runs on boot — no
   loader code, no bucket, and the seed is versioned and auditable in git):
   **food** = TACO 4ª edição, ~597 PT-BR rows with kcal *and* macros;
   **exercises** = the handoff's 47 hand-weighted EXCAT entries (which always
   win on a name match) plus ~870 `free-exercise-db` rows (public domain).
   **Rounding is server-side** — `max(5, round(k/5)*5)` on table hits and model
   answers alike, so the roundness is a property of the answer rather than of
   one screen, and whatever the model returns is laundered at the boundary.
   Below the fuzzy threshold is a **miss, not a bad guess**: the table is
   consulted first and would never re-ask, so a wrong row is worse than a model
   call. If hit quality disappoints, the lever is aliases (ours, free), never a
   lower threshold.

7. **Write-back is automatic into the CACHE, curated into the SEED.** Model
   answers are written to `food_estimate_cache` / `exercise_estimate_cache`
   automatically — so every miss is a miss exactly once and free forever — but
   **never** promoted into the seeded `food` / `exercise` tables. The reason is
   asymmetric blast radius: a confidently wrong answer promoted into the seed is
   consulted first and becomes permanently wrong for everyone, while the same
   row in a disposable cache is one `TRUNCATE` from gone. Promotion stays a
   human act (a SQL review when a name proves itself), not a feature. There is
   no correction signal from the app — typing over an estimate is local — so a
   bad cached number persists until someone clears it. Accepted, and precisely
   why promotion is manual.

8. **The estimate cache is USER-LESS plaintext by design.** It stores a
   normalized name, a unit and a number: **no `user_id`, no user-tied
   timestamp, no quantity**. Divorced from who typed it, a food name is not
   personal data, and public reference values are not a user's data at all —
   which is what keeps a shared plaintext cache inside Vita's data stance.
   **ADR-0003 is unchanged and this is not a precedent for user data.** This
   clause exists so that nobody later "improves" the cache by adding a
   `user_id` (for per-user tuning, for analytics, for anything): doing so turns
   a reference table into an unencrypted log of what people eat, which is
   exactly the thing ADR-0003 exists to forbid. If per-user behaviour is ever
   wanted, it belongs in the encrypted user document, not here.

9. **TACO licence caveat — ship now, settle before the store** (CEO Round 16
   answer 1). TACO (NEPA/UNICAMP, 2011) is the only table that speaks the words
   the CEO actually types (arroz, feijão, pão francês, tapioca), it is published
   free for consultation and mirrored everywhere, but it carries **no explicit
   licence for redistribution inside a product**. Fine for a pre-production
   single-user app; not fine on the Play Store. Contained by design: provenance
   is a per-row `source` / `source_ref` column, the seed is one migration, and
   the swap path (USDA FoodData Central values — public domain — under our own
   PT-BR name list) is a re-run of BE-060. The ticket that imports it re-reads
   the licence text at download time and records what it found. Open Food Facts
   (ODbL share-alike) and wger (CC-BY-SA) were evaluated and **rejected on
   licence terms**; `free-exercise-db` was taken because it is public domain.

   **Licence text as actually re-read at import time (BE-060/BE-062, 2026-08-24):**
   - **TACO** — imported from the mirror `github.com/marcelosanto/tabela_taco`
     (`TACO.json`, 597 rows, seeded as 590 after dropping 6 rows with no published
     energy value and 1 duplicate name). That repository ships an **MIT** `LICENSE`
     ("Copyright (c) 2023 Marcelo Santos") and its README states the project is under
     MIT. **That grant is the repository owner's, over the repository — it is not, and
     cannot be, a grant from NEPA/UNICAMP**, who hold the rights to the underlying
     table. The TACO table itself still carries **no explicit redistribution licence**:
     nothing in the mirror, and nothing findable at download time, permits shipping it
     inside a product. Decision 9 stands unchanged — ship now, settle before the store.
     Recorded per row as `source = 'taco-4'`, `source_ref = 'taco4:<row id>'`.
   - **free-exercise-db** — `github.com/yuhonas/free-exercise-db`, `dist/exercises.json`,
     873 rows. Declares **The Unlicense** (GitHub reports SPDX `Unlicense`; `LICENSE.md`
     carries the standard Unlicense text; the README badges it and calls the project an
     "Open Public Domain Exercise Dataset"). A public-domain dedication with a permissive
     fallback: **no attribution obligation, no share-alike, nothing to settle before
     publishing.** Recorded as `source = 'free-exercise-db'`, `source_ref = <its id>`.
   - **wger** was not downloaded at all, so its CC-BY-SA terms were not re-read; the
     rejection in this decision stands on the licence type alone.

   **One deviation from the plan's table shapes, taken under this decision's own rule
   that "the lever is aliases (ours, free), never a lower threshold":** V014 also creates
   an **`exercise_alias`** table, mirroring `food_alias`. Two reasons, both found only at
   import: (a) EXCAT and free-exercise-db are **entirely English**, so every Portuguese
   name the CEO types would miss on first use; (b) free-exercise-db contains **no
   "Bulgarian" row at all** — the nearest, "Split Squats", scores 0.435 against
   "bulgarian split squat", just under the 0.45 floor. 53 curated aliases (PT-BR plus
   that one) close both without touching the threshold.

10. **A guessed exercise mapping paints pale, never full** (CEO Round 16 answer
    5). `/estimate/exercise-muscles` returns `estimated: true` when nobody
    curated the mapping, and the app must render it in the same pale band as
    `wholeBody`, never the full tone a catalog entry earns. When the model is
    not confident the response is an **empty** `muscleRoles` list and the app
    keeps "not mapped" — guessing would invent data. The flag does not reach the
    saved program document: the app folds it into the pale/soft rendering flag
    it already has, so no new field lands in the plan.

11. **D9 — hand-built days keep their `~kcal` line** (CEO Round 16 answer 4,
    which *changed* the handoff: "as kcal vão ser estimadas, tanto pelo usuário
    quanto pela IA, portanto vamos manter"). New `POST /v1/estimate/workout-kcal`
    takes the whole day's exercises (`{name, fam, sets, reps, min}`) and returns
    `{kcal, estimated: true}`, feeding the **existing** `ProgramDay.kcalEstimate`
    — no change to the program schema. One day per call, because session energy
    is a property of the session and not a sum of independent rows. It has no
    non-estimated answer, hence `estimated` is always `true`: the number can
    never travel without its label.

**Guards, all reusing what exists:** bearer JWT; one call counts against the
existing per-user daily `ParseQuota` (50/day → 429 + `Retry-After`) — **no new
limiter**; a hard cap of 60 items per request (0 or >60 → 400); no idempotency
key (these endpoints write no user data and own no user state); miss counts ride
the existing `ParseMetrics` INFO line, so the $40 budget alarm and a CloudWatch
query cover cost. Failure is partial by design: table answers stand and misses
come back `null` (**200**) if the model leg dies; only a failed model leg **with
zero table hits** is a **422**, matching `/parse/text`. Nothing about the user's
plan is touched either way. Responses are **positional** — same length, same
order, `null` for no answer, never a silently shifted array.

**Storage note:** the plan/program fields land inside blobs that are already
AES-256-GCM under the per-user DEK, AAD-bound to `userId:table.column` and
crypto-shredded on account deletion — **no new crypto decision**. The two new
migrations are expand-only and hold **no user data at all**: **V013**
(`food`, `food_alias`, `food_estimate_cache`, `pg_trgm` + GIN index) and
**V014** (`exercise`, `exercise_muscle`, `exercise_estimate_cache`).

## Consequences

- **Blocks the app team.** Every v4.2 builder ticket is blocked on 0.9.0
  landing; the orchestrator relays it immediately (ADR-0006). App types
  regenerate from this file — `npm run api:check` in `app/services/vita-app`
  fails until they do, which is expected app-side work, not a contract defect.
  Note for the regeneration: `/estimate/food-kcal`'s `kcal` is expressed as
  OpenAPI 3.1 `type: [integer, "null"]` (3.1 has no `nullable` keyword).
- Implementation lands in **BE-058** (plan save path: `kcal`/`kcalEstimated`
  pass-through, the dropped "each meal needs at least one item" line),
  **BE-059** (program save path: `durationMin`, `wholeBody`, `traps` in
  `Muscles.VOCAB`, the normalization chokepoint), **BE-060** (V013 + TACO seed +
  `FoodLookup`), **BE-061** (`/estimate/food-kcal`), **BE-062** (V014 + EXCAT and
  `free-exercise-db` seeds), **BE-063** (`/estimate/exercise-muscles`),
  **BE-065** (`/estimate/workout-kcal`), shipped by **BE-064** via a Terraform
  `app_image_tag` apply (the OPS-024 pattern — no CLI task-def clones).
- Two rules binding on every client: (a) the app sends only the items whose kcal
  is still empty and merges by index, so **an estimate can never overwrite a
  number the user typed**; (b) "Build it here" over an existing plan **replaces**
  it (CEO Round 16 answer 2 — same semantics as "Import a PDF replaces the plan
  you have now", previous version kept in history), and the app must not offer
  the builder while a PDF parse job is running, since both write the current
  version and the job would land last and win, silently, with `status: "review"`.
- redocly lint: **valid, exit 0** — 49 warnings vs 45 on 0.8.0, the +4 being the
  same pre-existing cosmetic classes (3 × missing `operationId` for the three new
  operations, 1 × `tag-description` for the new `estimate` tag).
- Ceilings carried forward and accepted: a bad cached estimate persists until
  someone truncates the cache (decision 7); TACO's licence is unsettled for a
  published app (decision 9); programs still have no stable day ids, so
  `WorkoutDetail.planDay` points at a day *name* and renaming "Day A" → "Legs"
  breaks the linkage exactly as a plan re-import does.
