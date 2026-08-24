# Vita v4.2 — Backend implementation plan (manual plan + training builders)

**Session:** planning round, 2026-08-24 · **Author:** backend team lead · **Status:** proposal, awaiting CEO review
**Inputs:** `HANDOFF_v4.2_manual_setup.md` (binding handoff) · **CEO Round 16** (hybrid estimation, binding —
baked in below, not offered as an option) · contract v0.8.0 · `backend/Next_session.md` (V001..V012, task-def
`vita:10`) · `PlanService.kt` / `PlanController.kt` / `Muscles.kt` / `ParseQuota.kt` (read, not guessed).

**No code was written this session.** Tickets are proposed, not filed.

---

## 0 · Headline

The two builders **ride the endpoints that already exist**. A hand-built plan is a `POST /v1/plan` with the
same `EatingPlanDraft` a PDF parse produces, minus swaps and options; a hand-built program is a
`POST /v1/program` with the same `TrainingProgramDraft`. No new persistence concept for either.

What *is* new is the knowledge layer behind two "fill it in for me" passes: **a seeded food table and a seeded
exercise table, consulted first; Claude asked only for what they miss; misses cached so they shrink over time**
(CEO Round 16). A table hit costs nothing and answers in milliseconds; only genuinely new words reach the model.

Net footprint: **6 additive contract fields (v0.9.0) + 1 relaxation, 2 new endpoints, 2 expand-only migrations
(V013/V014) whose rows are the seed itself.**

---

## 1 · A — Persistence of hand-built plans and programs

### 1.1 Eating plan: `POST /v1/plan`, unchanged path

What the app sends at "Finish setup" (`bmMeals` → `EatingPlanDraft`):

```jsonc
{ "summary": "5 meals, built by hand",        // required, non-blank — the app synthesizes it
  "status":  "ready",                          // born ready; never passes through "review"
  "dailyTotals": { "kcal": 2180 },             // client sum; omit entirely while any item is empty
  "meals": [
    { "name": "Breakfast", "time": "07:00", "kcal": 465, "items": [
        { "name": "Oats", "quantity": 60, "unit": "g",    "kcal": 235, "kcalEstimated": true  },
        { "name": "Egg",  "quantity": 2,  "unit": "unit", "kcal": 155, "kcalEstimated": false } ] },
    { "name": "Supper", "time": "21:30", "items": [] }        // a named slot with no food yet
  ] }
```

What the server does today, unchanged: `PlanService.decorate()` stamps `m-1…m-N` and `it-1…it-N` in document
order, computes `PortionBounds` from quantity+unit (`g` → 0..120 step 10 · `unit`/`serving` → countable
0..4 step 1 — the builder's four units are all already handled by `PortionBoundsHeuristic`), encrypts the whole
doc under the per-user DEK, caps history at 5, clears the portion overlay, echoes 201 with the ids.
**It computes no nutrition** — `dailyTotals`/`PlanMeal.kcal` are client numbers for a parsed plan too (a report
page's stated totals). Nothing in the save path requires macros, `nutritionPerUnit`, `micros`, swaps or options.

**Born `ready`, never `review`:** `EatingPlanDraft.status` defaults to `"ready"` in the DTO and `"ready"` is in
`VALID_STATUS` — so the Home "finish setup" banner and Today's review state never fire for a built plan.
Correct: the review already happened, on the builder's own review screen.

**Two things bite** (both real, both read out of the code):

1. `PlanController.validatePlan()` rejects a meal with **zero items** ("Each meal needs at least one item") and
   the schema says `minItems: 1`. The builder lets a meal exist with nothing in it (§2.3 "Nothing here yet").
   → **contract relaxation + one deleted line** (delta D1). The precedent is 0.8.0 relaxing `MealDetail.items`.
2. There is **no per-item kcal field**. `PlanItem` carries `nutritionPerUnit` (per one gram/unit); the builder's
   `k` is the **total for the stated quantity**, an integer, multiple of 5. Encoding it as `kcal/quantity`
   stores a float nobody typed and loses the roundness the handoff is deliberate about ("um `237` sugere
   precisão que a estimativa não tem"). → **`PlanItem.kcal` + `PlanItem.kcalEstimated`** (deltas D2/D3).
   `PlanMeal.kcal` already exists for the meal total, so this is the missing rung of an existing ladder.

**POST, not PUT.** `PUT /plan` 404s when there is no current version, and the builder's whole point is the
no-document user. Always `POST` (new version) — which also resets the portions overlay, correct for a new plan.

### 1.2 Training program: `POST /v1/program`, unchanged path

```jsonc
{ "summary": "Gym + Muay thai",                 // the program name — the app's program screen reads `summary`
  "days": [ { "name": "Day A", "exercises": [
      { "name": "Squat", "sets": 4, "reps": 8,
        "muscleRoles": [ {"name":"quads","role":"primary"}, {"name":"glutes","role":"primary"},
                         {"name":"core","role":"secondary"} ] },
      { "name": "Muay thai", "durationMin": 30, "wholeBody": true,
        "muscleRoles": [ {"name":"quads","role":"secondary"}, {"name":"core","role":"secondary"} ] },
      { "name": "Pole dance" }                  // nothing matched and nothing guessed — "not mapped"
  ] } ] }
```

`TrainingProgramDraft` needs `summary` non-blank + ≥1 day; `ProgramDay.exercises` is already nullable, so an
empty Day J saves fine. Programs get no server ids and no bounds — `importVersion()` stores the doc verbatim.

**Two gaps:** `Exercise` has **no duration field** (the `time` family's minutes have nowhere to go — `sets`/
`reps`/`loadKg` only) and no way to say "whole body — the split is a guess". → deltas **D4** (`durationMin`)
and **D5** (`wholeBody`). The `set`/`time` family itself is **derived, not stored** (`durationMin` present =
time family): the builder keeps all three inputs locally so switching family doesn't lose typing, but only the
family's own fields go on the wire.

### 1.3 Muscle vocabulary: the app's 10 keys → the contract's 11

`EXCAT`'s weights are keyed by the **app's** map keys (`MGN`); the wire speaks the closed `Muscles.VOCAB`. The
inverse of the app's existing `KEY_OF` (`app/.../muscle/muscleData.ts:50`) is the mapping, and it belongs
**app-side, next to EXCAT** — the backend never sees a weight:

| app | wire | | app | wire |
|---|---|---|---|---|
| `ch` | `chest` | | `co` | `core` |
| `bk` | `back` | | `qu` | `quads` |
| `sh` | `shoulders` | | `ha` | `hamstrings` |
| `ar` | `biceps` **+** `triceps` (both fold back to `ar`) | | `gl` | `glutes` |
| `tr` | `traps` **(new, delta D6)** | | `ca` | `calves` |

Role from weight, at the CEO's Round-15 cut: **`w ≥ .7` → `primary`, else `secondary`** — the same `.7` as
`tierOf`, so the builder's map, the session badge and Trends can never disagree. Squat → quads/glutes primary,
core secondary. Football → everything secondary (max weight .55), which is exactly the pale reading.

`traps` today folds to `back` in `Muscles.ALIASES` — one line, but it permanently deletes a distinction the app
has a chip and a silhouette for (Face pull `tr:.8`, Deadlift `tr:.5`). Adding it to `VOCAB` and dropping the
alias is 2 lines + `traps: "tr"` in the app's `KEY_OF` (see Q3).

**And one chokepoint fix:** the program save path does **not** normalize client-sent muscles (only the *parse*
path calls `Muscles.normalize()`), so a typo would be stored verbatim in an encrypted blob nobody can grep.
BE-059 routes `POST/PUT /program` through the same normalizer — 3 lines, closes the hand-built, the imported
**and** the estimate-fallback paths at once.

### 1.4 Contract deltas — v0.9.0, all additive except D1 (a relaxation)

| # | Surface | Change |
|---|---|---|
| **D1** | `PlanMeal.items` | `minItems: 1` → `0` (a named slot with no food). Drop the matching line in `validatePlan()`. |
| **D2** | `PlanItem.kcal` | number ≥ 0 — total kcal for the item at its stated quantity (integer, multiple of 5 when it came from the estimate pass). |
| **D3** | `PlanItem.kcalEstimated` | boolean — the `est` flag (`~235`, dashed base). Present without `kcal` → 400. |
| **D4** | `Exercise.durationMin` | integer ≥ 1 — the time family's minutes. |
| **D5** | `Exercise.wholeBody` | boolean — "the split is a guess" (pale tint). |
| **D6** | muscle enums ×3 + `Muscles.VOCAB` | add `traps`; drop the `traps → back` alias. |
| **D7** | new `POST /v1/estimate/food-kcal` | §2.3. |
| **D8** | new `POST /v1/estimate/exercise-muscles` | §2.5. |

**No delta needed** for: plan/program POST·PUT·GET·history semantics, ids, portion bounds, `status`,
`summary`, `dailyTotals`, `PlanMeal.time`, the portions overlay, `/parse/*`, entries, `/me/settings`.

---

## 2 · B — The estimation service (hybrid, CEO Round 16)

One lookup order, used by both endpoints:

```
normalized exact  →  alias  →  trigram fuzzy (pg_trgm, threshold)  →  estimate cache  →  Claude (misses only)
        ↑ seeded table, zero marginal cost, <5 ms                              ↓
                              cache write-back (automatic, into the CACHE table — never into the seed)
```

### 2.1 Food table — seed, license, shape

**Recommended seed: TACO 4ª edição (NEPA/UNICAMP, 2011) — ~597 foods, PT-BR names, kcal + protein/carb/fat per
100 g.** It is the table whose vocabulary matches what the CEO actually types (arroz, feijão, pão francês,
tapioca, cuscuz, açaí) and it is small enough to ship as SQL. **License caveat: TACO carries no explicit open
licence** — it is published free for consultation and widely mirrored as CSV/JSON, which is fine for a
pre-production single-user app but must be settled before store publishing (**Q1**).

Evaluated and **not** taken in round 1:

| Source | Rows | License | Why not |
|---|---|---|---|
| **TBCA** (USP/FoRC) | ~2,000 foods | free use *with citation*, no bulk download | Bigger and PT-BR, but web-only extraction; TACO covers the staples at a fraction of the work. Best round-2 expansion if hit rate disappoints. |
| **USDA FoodData Central** (SR Legacy + Foundation) | ~8,000 foods | **public domain** (US Gov) — the cleanest licence of the three | English names the CEO will never type. Keep as the expansion path the day an EN user appears, or as a values layer under our own PT alias list if Q1 goes badly. |
| **Open Food Facts** | ~3M products | **ODbL 1.0** — share-alike on derived databases + attribution | Barcode/brand-shaped and uneven; the share-alike obligation on a shipped derivative database is real cost for data the Claude fallback already covers better ("Whey X"). Rejected. |

Shape (`V013`, expand-only, plaintext — public reference data, no user in it):

```sql
food(id, name_norm, name_pt, kcal_100g, protein_100g, carb_100g, fat_100g,
     grams_per_unit NULL, source, source_ref)          -- source/source_ref = provenance + licence audit
food_alias(name_norm PK, food_id)                      -- PT + EN aliases, ours; seeded + curated
food_estimate_cache(name_norm, unit, kcal, created_at) -- Claude answers, automatic write-back
CREATE EXTENSION IF NOT EXISTS pg_trgm;                -- the fuzzy matcher, no new dependency
```

**Normalization** (one Kotlin function, one SQL expression, identical rules): lowercase → strip accents (NFD +
drop combining marks) → drop punctuation → collapse whitespace → drop leading quantity words. "Pão Francês" and
"pao frances" hit the same row.

**Matching**, in order: exact `name_norm` → `food_alias` → `similarity(name_norm, ?) ≥ 0.45` on a GIN trigram
index, best match wins, ties by shortest name. Below the threshold it is a **miss**, not a bad guess — a wrong
table row is worse than a Claude call, because the table is consulted first and would never re-ask.

**Units:** `g`/`ml` → `qty/100 × kcal_100g` (ml treated as g; for water, juice and milk the density error is
inside the noise of an estimate, and the number is marked as one). `unit`/`serving` → only when the row has
`grams_per_unit` (egg 50 g, pão francês 50 g, fatia 25 g — seeded by hand for the countables that matter);
otherwise **a miss**, and Claude answers. That rule is what keeps "1 unidade" of bread and of watermelon from
sharing a number.

### 2.2 Write-back: automatic into the cache, curated into the table — **recommended**

Claude's answers are written back **automatically**, but into `food_estimate_cache`, never into `food`. Why the
split: the seeded table is consulted first and would never re-ask, so one confidently wrong model answer
promoted into `food` becomes permanently wrong for everyone; in a disposable cache the same row is one
`TRUNCATE` away from gone, and promotion into `food` stays a human act (a SQL review when a name proves itself,
not a feature to build now). The cache still delivers the whole point of the hybrid: **every miss is a miss
exactly once**, then it is free forever.

**Privacy:** the cache stores a normalized food name + unit + kcal. **No user id, no timestamp tied to a user,
no quantity** — divorced from who typed it, a food name is not personal data, which is what keeps a plaintext
shared cache inside Vita's data stance (ADR-0003 unchanged). This must be written into ADR-0020 so nobody later
"improves" the cache by adding a `user_id`.

### 2.3 `POST /v1/estimate/food-kcal`

```
POST /v1/estimate/food-kcal          Authorization: Bearer <accessToken>
{ "items": [ { "name": "Aveia", "quantity": 60, "unit": "g" },
             { "name": "Pão francês", "quantity": 1, "unit": "unit" } ] }

200 { "items": [ { "kcal": 235 }, { "kcal": 140 } ] }
```

- **Positional and total** — same length, same order, always. An item nothing could answer comes back
  `{"kcal": null}` and the app leaves the dash; never a silently shifted array.
- **Rounding is server-side**: `max(5, round(k/5)*5)`, applied to table hits and model answers alike. The
  handoff states the format as a property of the answer, not of one screen — enforcing it at the boundary means
  the number is legal no matter which client asks, and it launders whatever the model returns.
- **Sync.** Full-hit passes never leave Postgres (<100 ms). Misses go out in **one batched call** for the whole
  pass, `claude-haiku-4-5`, ~12 output tokens per item → 5–12 s worst case, inside a 25 s client timeout and API
  Gateway's 29 s ceiling. Cap **60 items** per request (>60 → 400); a bigger plan is two passes behind the same
  "Working through the list…" box. No job table, no polling.
- **Auth + abuse cap:** bearer JWT; one call counts against the existing `ParseQuota` (50/day/user, 429 +
  `Retry-After`). No new limiter.
- **No idempotency key** — the endpoint writes no user data and owns no user state.
- **Failures:** table answers stand; if the model leg fails, those items return `null` (**200, partial**) rather
  than failing the pass — a total failure of the model leg with zero table hits returns **422**, matching
  `/parse/text`. Nothing about the plan is touched either way.
- **"Never overwrites a typed number" is an app invariant** (handoff §2.4): the app sends only the items whose
  `k` is null and merges by index.

### 2.4 Exercise table — seed, license, shape

**Recommended seed: the handoff's `EXCAT` (47 entries, hand-weighted, ours — always wins on a name match) +
`free-exercise-db` (~870 exercises, JSON, public-domain dedication, per-exercise primary/secondary muscles).**
Its muscle vocabulary (`quadriceps`, `lats`, `traps`, `abdominals`, …) folds onto `Muscles.VOCAB` through the
alias map we already have.

**wger evaluated and not taken:** its exercise database is **CC-BY-SA 4.0** — attribution plus share-alike on
derivatives, for ~600 exercises whose only real advantage is pt-BR translations. Not worth the obligation when
the Claude fallback covers a PT name for a fraction of a cent. (Both licences get re-read at import time and
recorded in the row's `source` column — see BE-062.)

`free-exercise-db` gives roles, not weights, which is exactly what the wire carries; the builder's live map
needs weights, so **primary → .9, secondary → .45** — both clear of the `.7` cut and inside the map's 20–70 %
band. `EXCAT` weights win wherever the name matches.

```sql
exercise(id, name_norm, name, family, whole_body, source, source_ref)
exercise_muscle(exercise_id, muscle, role)              -- Muscles.VOCAB, primary|secondary
exercise_estimate_cache(name_norm, payload_json, created_at)
```

### 2.5 `POST /v1/estimate/exercise-muscles`

```
{ "names": ["Bulgarian split squat", "Pole dance"] }
200 { "items": [ { "muscleRoles": [{"name":"quads","role":"primary"}, …],
                   "wholeBody": false, "estimated": true },
                 { "muscleRoles": [], "wholeBody": false, "estimated": true } ] }
```

Same lookup order, same cache policy, same quota. `estimated: true` means *nobody curated this* — and the app
must render an estimated mapping in the **pale (whole-body) band**, not the full tone. That keeps the handoff's
honesty rule intact while granting the CEO's graduation path: a free-typed exercise stops saying "not mapped",
but it never pretends to the confidence of a catalog entry (**Q5**). A model answer with no confident muscles
comes back with an empty list and the app keeps "not mapped" — the app collapses `estimated` into the existing
`soft` flag before saving, so **no new field reaches the plan document**.

### 2.6 Cost

| Path | Marginal cost | Latency |
|---|---|---|
| Table / alias / fuzzy hit | **$0** | < 5 ms |
| Cache hit (a previous miss) | **$0** | < 5 ms |
| Miss → Claude (batched, per pass) | ~400 input + 12 output tokens per missed item | 5–12 s |

`claude-haiku-4-5` at $1 / $5 per MTok: a pass with 10 misses ≈ **$0.001**; a 60-item plan where *everything*
misses ≈ **$0.005** — and it can only happen once per name, ever, because of the cache. Realistic month for the
CEO: **under $0.10**. Absolute ceiling per user per day, if every one of the 50 quota calls were 60 fresh misses:
$0.25/day — bounded by `ParseQuota` alone, so **no new limiter is proposed**; the miss count goes on the existing
`ParseMetrics` INFO line so the $40 budget alarm and a CloudWatch query cover the rest.

---

## 3 · C — Tickets

Next free number: **BE-057** (053 never filed, 054 backlogged, 056 shipped). Model per the CEO cost rule.

### BE-057 · Contract v0.9.0 + ADR-0020 (manual builders + hybrid estimation) — **S** — blocks the app team
Bump the contract 0.8.0 → 0.9.0 with exactly deltas D1–D8 (§1.4) and record in `Doc/ADRs/ADR-0020`: hand-built
plans reuse the existing save path; per-item kcal is a total, not per-unit; the EXCAT→vocabulary translation
lives app-side with the `.7` primary cut; estimation is table → cache → Claude; **write-back is automatic into
the cache and curated into the seed**; the cache is user-less plaintext by design (ADR-0003 unchanged).
**Acceptance:** `redocly lint` exit 0 (pre-existing warning classes only); every new field carries the
"estimate, not a target" prose; orchestrator relays 0.9.0 to the app team the moment it lands.

### BE-058 · Hand-built eating plans on the existing save path — **S** — needs BE-057
`PlanItem` gains `kcal` + `kcalEstimated` (pass-through, no server math); `validatePlan()` drops the "each meal
needs at least one item" line; `kcalEstimated` without `kcal` → 400.
**Acceptance:** POST of the §1.1 body → 201 with `m-1..m-2`, `it-1..it-2`, Oats `portion {0,120,10}`, Egg
`portion {0,4,1}`, the empty Supper meal preserved as `items: []`; GET returns `kcal`/`kcalEstimated`
byte-identically; PUT round-trips the ids; the plan is `ready` without ever being `review`. +≈6 tests.

### BE-059 · Program save path: `durationMin`, `wholeBody`, `traps`, vocabulary normalization — **S** — needs BE-057
`PlanExercise` gains `durationMin` + `wholeBody`; `Muscles.VOCAB` gains `traps` and loses the `traps → back`
alias; `POST/PUT /program` runs every exercise through `Muscles.normalize()`.
**Acceptance:** the §1.2 body round-trips verbatim; unmappable muscles dropped, duplicates deduped primary-wins,
`traps` survives, a muscle-less exercise stays muscle-less. +≈5 tests.

### BE-060 · Food table: `V013` + TACO seed + normalization & matching — **M** — needs BE-057
`V013__food_tables.sql` creates the three tables + `pg_trgm` + the GIN index and **carries the ~600 seed rows as
INSERTs** (Flyway already runs on boot — no loader code, no S3, the seed is versioned in git and auditable).
The TACO→SQL conversion is a one-off dev script under `backend/tools/`, not runtime code; it records `source` +
`source_ref` per row and the ticket **re-reads the licence text at download time** and writes what it found into
the ADR. Plus `FoodLookup` (normalize + exact/alias/trigram) and hand-seeded `grams_per_unit` for the countables
that matter (egg, pão francês, fatia de pão, banana, ovo, tapioca).
**Acceptance:** "Pão Francês" / "pao frances" / "PÃO FRANCES" all hit one row; "arroz branco cozido" hits
"Arroz, tipo 1, cozido" by trigram; "xyzzy" misses (no forced match); `Aveia 60 g` → 235; a `unit` lookup with
no `grams_per_unit` misses. +≈12 tests, no network in tests.

### BE-061 · `POST /v1/estimate/food-kcal` — **M** — needs BE-060
Controller + service implementing §2.3: lookup order, batched single Claude call for the misses only,
server-side rounding, positional response, automatic cache write-back, `ParseQuota`, miss count on the
`ParseMetrics` line.
**Acceptance:** 60 items → 60 results in order; an all-hit pass makes **zero** outbound HTTP calls (asserted);
a mixed pass calls the model **once** with only the missed names; a repeat of the same missed name makes zero
calls (cache); every non-null value is an integer, multiple of 5, ≥ 5; 0 or 61 items → 400; quota → 429;
model leg fails with table hits present → 200 with nulls for the misses; no hits and the leg fails → 422.
Plus one `@Tag("live")` eval (≈$0.01): `Aveia 60 g`, `Pão francês 1 unit`, `Coxinha 1 unit` (a deliberate
miss), `Água 500 ml` → sane band, water = 5 (the floor), whole pass < 20 s.

### BE-062 · Exercise table: `V014` + EXCAT + free-exercise-db seed — **M** — needs BE-057
`V014__exercise_tables.sql` with the same seed-as-SQL pattern: EXCAT's 47 entries (weights → roles at `.7`) plus
~870 `free-exercise-db` rows mapped onto `Muscles.VOCAB`, `whole_body` set from EXCAT's 4th element, provenance
+ licence recorded per row, licence re-read at import.
**Acceptance:** "squat" → quads/glutes primary + core secondary from EXCAT (not from the public DB); "bulgarian
split squat" resolves from the public DB; every seeded muscle is in `Muscles.VOCAB` (asserted over the whole
table); `traps` rows exist; row count logged at import. +≈8 tests.

### BE-063 · `POST /v1/estimate/exercise-muscles` — **S** — needs BE-062
§2.5: same lookup order, same cache policy, `estimated` flag, empty list when the model is not confident,
answers normalized through `Muscles.normalize()` before they leave (or reach the cache).
**Acceptance:** catalog name → `estimated: false`, zero HTTP; unknown name → one call, cached, `estimated: true`;
a model answer containing "lats"/"abs" is normalized to `back`/`core`; an unmappable-only answer returns an empty
list rather than a guess. +≈6 tests + one live eval line ("Pole dance").

### BE-064 · v4.2 image + prod probes — **S** — needs BE-058..063
arm64 image → ECR; devops bumps `app_image_tag` → task-def **`vita:11`**. `V013`/`V014` ride Flyway on boot.
**Acceptance:** `/health` 200; migration log shows both applied with the expected row counts; probes: (1) the
§1.1 hand-built plan → 201 with ids and the empty meal; (2) the §1.2 program → 201 with `traps` + `durationMin`;
(3) 12 PT-BR foods → 12 rounded integers, CloudWatch shows the miss count; (4) the same 12 again → zero model
calls; (5) the imported PDF plan still GETs unchanged. Asana BE-057..064 → Done. No new AWS resource, no new SSM
parameter, no new env var beyond the three `vita.ai.estimate-*` knobs (defaults in `application.yaml`).

**Sequence:** `BE-057 → {058, 059, 060, 062} in parallel (disjoint files) → {061 (needs 060), 063 (needs 062)} → 064 + OPS bump.`
**Total ≈ 3–3.5 days.** Suite baseline 227 green (+~35 expected). Migrations claimed: **V013**, **V014**.

---

## 4 · D — Risks and gotchas

1. **A wrong table row is worse than a model call** — it is consulted first and never re-asked. Hence the 0.45
   trigram floor, best-match-wins-or-miss, and no promotion of cached model answers into the seed without a
   human. If hit quality disappoints, the lever is aliases (ours, free), not a lower threshold.
2. **TACO licensing** is unsettled for a published app (Q1). Contained by design: provenance is a column, the
   seed is one migration, and the swap path (USDA values + our own PT alias list) is a re-run of BE-060.
3. **PT-BR names** are exactly why the seed is Brazilian and the fallback is a model: no table survives
   "tapioca com queijo coalho", and a missing cedilla must not change the answer (normalization).
4. **Unit ambiguity.** `unit`/`serving` resolve only via `grams_per_unit`, else they miss to Claude. We
   deliberately do **not** return the assumed grams — the screen has nowhere to put it and it would invite
   negotiation with a number the person didn't ask for (handoff §7).
5. **Cache poisoning is bounded**: user-less rows, one `TRUNCATE` to reset, nothing user-visible depends on a
   cache row surviving. There is no correction signal from the app (typing over an estimate is local), so a bad
   cached number persists until someone clears it — accepted, and the reason promotion stays manual.
6. **`POST /plan` is destructive by design**: new version, oldest of 6 evicted, portions overlay cleared. The app
   must not autosave the builder — one save at "Finish setup".
7. **Fresh ids on every POST** mean day records pointing at the *previous* plan go stale (ADR-0019 risk 1).
   Hand-building makes plan replacement casual, so this now happens often instead of once. Past days still
   render (records carry their own title/items/totals); only the linkage dies. Same class: **programs have no
   day ids** — `WorkoutDetail.planDay` points at the day *name*, and renaming "Day A" → "Legs" is one tap.
8. **Builder vs a running PDF parse job**: both write the current version; the job lands last and wins, silently,
   with `status: "review"`. Server-side locking for a 5-user app is over-engineering — the app should not offer
   "Build it here" while a parse job is running.
9. **Minor:** client-sent `portion` is discarded (server-authoritative — never fabricate one), and D1 also lets a
   *parsed* plan save an empty meal (the same trade 0.8.0 made for skipped meals; the parse prompt never emits one).

---

## Open questions for the CEO

**Q1 — TACO licensing before the app is published.**
The food seed is TACO (UNICAMP), the only table that speaks the words you type. It is free to consult and
mirrored everywhere, but it carries no explicit licence for redistribution inside a product. Fine for now, not
fine on the Play Store. Options when we get there: ask UNICAMP for written permission, or rebuild the values
from USDA (public domain) under our own Portuguese name list. *Default: ship TACO now, settle before publishing.*

**Q2 — "Build it here" replaces the plan you have now?**
Same as "Import a PDF — replaces the plan you have now": one current plan, the previous kept in history (last 5),
portion overrides cleared. Not a merge. *Default: replace.*

**Q3 — Add a Traps silhouette to the saved data?**
Face pull, Deadlift and Barbell row carry traps in the catalog and the app has a Traps chip — but the backend
folds traps into back today, so a saved program loses it and the chip never lights. One value in the vocabulary
fixes it. *Default: add it.*

**Q4 — Calories only, no macros, for a hand-built plan?**
The estimate pass returns kcal, exactly as the handoff specifies. Note that TACO carries protein/carbs/fat for
free on every table hit, so the day the builder wants a macro split it is a field, not a project. *Default: kcal
only now, macros stored in the table from day one.*

**Q5 — A guessed exercise mapping: pale, or still "not mapped"?**
The handoff says a free-typed exercise lights nothing, because guessing would invent data. Your hybrid asks for
the graduation path. The proposal keeps both honest: a mapping Claude guessed paints in the **pale** band (the
same tone as "whole body — the split is a guess"), never the full tone a catalog entry gets; when the model
isn't confident, it stays "not mapped". *Default: as proposed.*
