# Backend spec — Meal Plan & Workout Plan round (contract v0.6.0)

Team: **backend** (Kotlin/Spring, `backend/services/vita-api`). Spec phase 2026-07-22.
Tickets: **BE-036 … BE-041** (Asana board `1216519867368580`, Backlog).

> **CEO AMENDMENTS 2026-07-22 — BAKED IN BELOW (this version is the only truth):**
> **A1** portions overlay is **plaintext** (not sensitive) — no per-user DEK, no AAD, no
> crypto-shred wiring; deletion = plain FK cascade. **A2** **no legacy/backfill work** — ids are
> assigned at save/parse time only; no on-read derivation; pre-0.6.0 rows may be invalidated;
> destructive migrations acceptable. **A3** program/workout persistence touched by this round
> needs no encryption (keep existing code where that's the shortest path; no repo-wide decrypt
> sweep). **A4** the handoff §1.2 nutrition table is EXAMPLE data — golden TEST input only; no
> product code or constant uses its numbers. **A5** PUT /plan doc-edit semantics: untouched item
> keeps its override; edited item's override resets; removed item's override pruned; re-import
> (POST) resets all. §10 Q1 is thereby ANSWERED — no open CEO questions.

Binding sources, in precedence order:

1. `docs/meal-plan-handover/DESIGN-SPEC.md` — CEO-approved architecture (2026-07-22). Do not relitigate.
2. `docs/meal-plan-handover/design_handoff_vita_v2 4/SPEC - Eating Plan & Training Program.md` — visual/data reference ("the handoff").
3. `docs/contracts/vita-api-v0.yaml` — v0.5.0 today; this round bumps to **0.6.0, additive only**.

Existing code this touches: `model/ai/PlanDtos.kt`, `service/ai/{PlanPrompts,PlanParseService,ParseService,ClaudeClient}.kt`,
`service/plans/PlanService.kt`, `repository/plans/PlanRepository.kt`, `controller/plans/PlanController.kt`,
`service/entries/EntryService.kt`, `model/entries/EntryDetail.kt`,
migrations `V001..V007` (next free: **V008**). (`CryptoService` is NOT touched — A1: the
portions table is plaintext; the doc blob keeps its existing envelope untouched.)

---

## 0 · Engineering decisions made here (not CEO questions)

| # | Decision | Why / ceiling |
|---|---|---|
| D-1 | Item ids `it-1…it-N` flat in document order, assigned at **save/parse-save time only**, **stored inside the doc blob**. NO on-read derivation, NO backfill (CEO A2): a stored doc without ids simply has no ids (and no usable overlay) until its next save re-assigns them. | Zero legacy code; we are pre-real-users. Ceiling: content-hash ids if positional identity ever proves too weak. |
| D-2 | Overlay **survives PUT /plan doc edits per-item** (CEO A5): untouched item keeps its override verbatim; **edited item** (its `quantity` or `unit` changed vs the previous doc) → **override deleted**; removed item → override pruned. **Resets fully only on POST /plan** (new version). No re-clamping needed — untouched items' bounds are unchanged by construction. | CEO A5 2026-07-22 (answers old §10 Q1). |
| D-3 | `PUT /plan/portions`: **unknown itemId → 422 whole-request reject** (orchestrator-fixed); known item with out-of-range/off-step qty → **clamp + snap**, echo stored map. Non-numeric/NaN/Infinity/negative → 400. | A stale-version client gets a clear "refetch /plan" signal; minor numeric drift never fails an offline sync. |
| D-4 | `PlanItem.portion` is **server-authoritative**: recomputed by the heuristic at parse AND at every save; client-sent `portion` is ignored/overwritten. No read-time derivation (A2 — reads return what's stored). | Determinism; no drift between parse-time and save-time bounds. |
| D-5 | When `muscleRoles` present and `muscles` absent, server derives `muscles` = role names (deduped). Roles are **never invented** from a bare `muscles` list. | Back-compat for old clients; no fake data. |
| D-6 | No `GET /plan/portions` endpoint — the overlay rides `GET /plan`. No PATCH — full-map PUT only (map is ≤ a few dozen keys). | Ponytail. |
| D-7 | `POST /plan` / `PUT /plan` responses stay plain `EatingPlanDraft` (no `portions` key). Only `GET /plan` carries the overlay. | POST just reset it (empty); PUT caller already holds it; GET is the sync point. |
| D-8 | Overlay is eating-plan-only (`plan_portions` table). No program overlay. | YAGNI — nothing in the design adjusts program quantities. |
| D-9 | The handoff §1.2 table is **EXAMPLE data, not product truth** (CEO A4): all nutrition values come from Claude parse estimates at import; totals are ALWAYS computed from per-item data. The table survives only as deterministic golden TEST input — fixtures assert values *computed from the fixture itself* (e.g. Σ(per.k × qty) over the 11 rows = 1,756.2, §7); no product code or ticket treats any table number as a constant. (The handoff prose "~1,880" is inconsistent with its own table — moot, both are just sample data.) |
| D-10 | Empty portions map on PUT = clear: delete the row. GET then omits the `portions` key entirely (never emits `{}`). | One representation for "no overrides". |
| D-11 | Program-parse per-exercise `muscles` (in contract since 0.5.0 but never extracted by the program tool) is added together with `muscleRoles` in BE-040. | The tool schema currently stops at name/sets/reps/loadKg — closing a real gap, not scope creep. |

---

## 1 · Contract v0.6.0 — exact additive diff

File: `docs/contracts/vita-api-v0.yaml`. `info.version: 0.5.0 → 0.6.0`. Append to `info.description`:

```
0.6.0 (meal-plan/workout-plan round — all additive): PlanItem gains
id/microsPerUnit/portion; GET /plan may return the sparse `portions`
overlay; PUT /plan/portions replaces it; Exercise gains muscleRoles.
Old clients ignore every new field; no 0.5.0 consumer breaks.
```

### 1.1 `PlanItem` — three new optional properties

```yaml
    PlanItem:
      type: object
      required: [name]
      properties:
        id:
          type: string
          maxLength: 40
          description: >-
            Server-generated stable item id ("it-1"…"it-N" in document order),
            assigned when a plan version is saved; the key of the portions
            overlay. Clients MUST round-trip it unchanged on PUT /plan. Absent
            on parse responses and on docs saved before 0.6.0 (no backfill —
            such docs have no usable overlay until their next save assigns ids).
        name:
          type: string
          maxLength: 100
        quantity:
          type: number
        unit:
          type: string
          maxLength: 20
          description: Free-form ("g", "ml", "slice"). Display verbatim.
        nutritionPerUnit:
          $ref: "#/components/schemas/MacroTotals"
        microsPerUnit:
          $ref: "#/components/schemas/MicrosPerUnit"
        portion:
          $ref: "#/components/schemas/PortionBounds"
```

(`name/quantity/unit/nutritionPerUnit` unchanged — shown for placement only.)

### 1.2 New component schemas

```yaml
    MicrosPerUnit:
      type: object
      description: >-
        Per-1-unit micronutrient estimates for a plan item — per single egg /
        slice / g / ml, exactly like nutritionPerUnit. All fields optional:
        omitted when the source doesn't state them and the model can't
        estimate them; the app then falls back to the daily `micros` array
        (CEO 2026-07-22 #2). The shared MacroTotals is NOT extended.
      properties:
        fiberG:    { type: number, minimum: 0 }
        sodiumMg:  { type: number, minimum: 0 }
        ironMg:    { type: number, minimum: 0 }
        calciumMg: { type: number, minimum: 0 }

    PortionBounds:
      type: object
      description: >-
        Slider bounds for the portion-adjust modal, derived by a deterministic
        backend heuristic at parse/save time — never by the model: countable
        units → 0..max(2·qty, qty+2) step 1; g → 0..2·qty rounded to step 10;
        ml → 0..2·qty rounded to step 50. Server-authoritative (client-sent
        values are ignored and recomputed on save). Absent when no usable
        quantity exists — the app keeps its portionRange fallback.
      required: [min, max, step]
      properties:
        min:  { type: number, minimum: 0 }
        max:  { type: number, minimum: 0 }
        step: { type: number, exclusiveMinimum: 0 }

    PortionsMap:
      type: object
      description: >-
        Sparse portion-override map for the CURRENT eating-plan version:
        PlanItem.id → chosen quantity in the item's own unit. A missing id
        means the item's default `quantity` (the design's planQty fallback).
        Bound to the current version; resets when a new version is imported.
        A document edit (PUT /plan) touches only the edited item: untouched
        items keep their overrides, an edited item's override resets
        (quantity/unit changed), removed items are pruned. Portion changes
        NEVER create plan versions (CEO 2026-07-22 #1).
      maxProperties: 200
      additionalProperties:
        type: number
        minimum: 0

    EatingPlanWithPortions:
      description: >-
        GET /plan response only — the same wire object as EatingPlanDraft plus
        an optional `portions` key (additive; NOT a {doc, portions} wrapper).
        Parse responses, POST/PUT echoes, and history versions never carry
        `portions`.
      allOf:
        - $ref: "#/components/schemas/EatingPlanDraft"
        - type: object
          properties:
            portions:
              $ref: "#/components/schemas/PortionsMap"
```

### 1.3 `GET /plan` — response schema swap (wire-compatible)

In `/plan.get.responses.200.content.application/json`:

```yaml
              schema: { $ref: "#/components/schemas/EatingPlanWithPortions" }
```

Same JSON object as before plus one optional key — old clients ignore it. POST/PUT/history unchanged.

### 1.4 New path `PUT /plan/portions`

```yaml
  /plan/portions:
    put:
      tags: [plans]
      summary: Replace the eating-plan portion overlay
      description: |
        Full replace of the sparse portion-override map for the CURRENT
        eating-plan version. Idempotent — the map is small, there is no
        incremental PATCH; offline clients drain last-write-wins. Values are
        clamped server-side to the item's `portion` bounds and snapped to its
        step; the response echoes the map as stored. Every key must be an item
        id of the current plan version — any unknown id rejects the whole
        request with 422 (the app should refetch GET /plan and resubmit). An
        empty map clears the overlay. Portion changes never create plan
        versions; the overlay resets when a new version is imported.
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/PortionsMap" }
      responses:
        "200":
          description: The overlay as stored (after clamping).
          content:
            application/json:
              schema: { $ref: "#/components/schemas/PortionsMap" }
        "400": { $ref: "#/components/responses/Problem" }
        "401": { $ref: "#/components/responses/Unauthorized" }
        "404":
          description: No current eating plan exists.
          content:
            application/problem+json:
              schema: { $ref: "#/components/schemas/Problem" }
        "422":
          description: One or more keys are not item ids of the current plan version.
          content:
            application/problem+json:
              schema: { $ref: "#/components/schemas/Problem" }
        default: { $ref: "#/components/responses/Problem" }
```

### 1.5 `Exercise.muscleRoles`

Add to the existing `Exercise` schema (alongside `muscles`, which is unchanged):

```yaml
        muscleRoles:
          type: array
          items:
            type: object
            required: [name, role]
            properties:
              name:
                type: string
                enum:
                  - chest
                  - back
                  - shoulders
                  - biceps
                  - triceps
                  - forearms
                  - core
                  - glutes
                  - quads
                  - hamstrings
                  - calves
              role:
                type: string
                enum: [primary, secondary]
          description: >-
            Same closed 11-silhouette vocabulary as `muscles`, with each
            muscle's role in THIS exercise. Feeds the body-map opacities and
            the PRIMARY/SECONDARY banner tag (handoff §2.2). Optional. When
            present and `muscles` is absent, the backend derives `muscles`
            from the role names; roles are never derived from a bare
            `muscles` list. Backend maps model output onto the vocabulary
            (lats/traps → back, abs/obliques → core) and drops unmappables.
```

`Exercise` is shared by `WorkoutDetail.exercises` (capture path) and `ProgramDay.exercises` (program path) — one schema change covers both. No workout-level roles field (DESIGN-SPEC scope).

---

## 2 · Item id scheme (save-time only — NO backfill, CEO A2)

**Scheme.** Ids are `it-N`, N = 1-based position in **flat document order** (meals in order, items within each meal in order). Assigned server-side **at save time only**; stored inside the doc blob (the doc is one JSON blob — no schema change). Reads return exactly what's stored — no derivation, no decoration, GET is trivially side-effect free.

**On POST /plan (new version):** ignore any client-sent ids; assign `it-1…it-N` fresh in document order. (New version = new identity space; the overlay was just reset anyway.)

**On PUT /plan (edit current):**
- Client-sent ids that are non-blank, ≤ 40 chars, and unique within the doc are **preserved verbatim**.
- Duplicate ids in the request → **400** ("duplicate item id: …").
- Items without an id get fresh ids `it-{max+1}…`, where max = the highest numeric suffix among incoming `it-N`-shaped ids (non-matching ids ignored for max; no matches → max = 0). Deterministic.
- After save, apply the A5 overlay rules (§4.4): prune removed ids, reset edited items' overrides, keep the rest.

**Pre-0.6.0 stored docs (no ids): no special handling.** We are not in production for real users (CEO A2) — such a doc reads back id-less, `PUT /plan/portions` against it 422s on every key (no effective ids), and the app's path out is re-import (POST) or an edit save (PUT assigns fresh ids via the rule above). Existing rows may be invalidated; dropping/recreating the dev DB is explicitly allowed. No derivation code exists.

**Same ids across users/versions** (`it-1` everywhere) is not a collision: the overlay row is keyed by (user, current plan version) — ids only need uniqueness within one doc.

Program docs (`/program`) also get ids assigned by the same save-time code path (they flow through the same `PlanService`) — harmless, uniform, and the muscle-map screen may key by them later. The overlay itself remains eating-plan-only (D-8).

---

## 3 · Portion-bounds heuristic (deterministic, unit-tested, never Claude)

New file: `service/plans/PortionBounds.kt` — a pure `object` (no Spring), used by `PlanService` (save/read decoration, BE-037) and `PlanParseService` (parse decoration, BE-039).

### 3.1 Unit classification

```
normalize(unit) = unit?.trim()?.lowercase() ?: ""
G_UNITS  = { "g", "gram", "grams" }
ML_UNITS = { "ml", "milliliter", "milliliters", "millilitre", "millilitres" }
class    = G  if normalize(unit) in G_UNITS
           ML if normalize(unit) in ML_UNITS
           COUNTABLE otherwise            // incl. null/blank unit, "slice",
                                          // "egg", "cup", "tbsp", "scoop", "unit"
```

Everything not exactly a gram/milliliter word is countable — no fuzzy matching. ("oz"/"cups" are countable: step-1 integer sliders are honest for them; extend the sets only when real plans demand it.)

### 3.2 Bounds

```
COUNTABLE:  q    = max(1, round(quantity ?? 1.0))          // half-up
            min  = 0;  step = 1;  max = max(2·q, q + 2)

G:          step = 10   |   ML: step = 50
            raw  = 2 · quantity
            min  = 0
            max  = max(step, round(raw / step) · step)     // half-up, ≥ one step
```

Rounding is **half-up** (`Math.round` on non-negative doubles). All outputs are whole numbers.

### 3.3 Applicability rule (when `portion` is emitted)

- COUNTABLE → always emitted (missing quantity defaults q = 1 → `0..3 step 1`).
- G/ML with `quantity == null || quantity <= 0` → **omit `portion`** (a degenerate 0..step slider is worse than the app's `portionRange` fallback).
- Computed at: parse response (both text and PDF), POST /plan save, PUT /plan save. Never at read time (A2 — reads return what's stored). Always recomputed from `quantity`+`unit`; client-sent `portion` is discarded (D-4).

### 3.4 Reference table (heuristic over the handoff's 11 items — table-driven test rows)

| item | qty unit | class | expected portion |
|---|---|---|---|
| Scrambled eggs | 2 egg | countable | 0..4 step 1 |
| Grilled bread | 1 slice | countable | 0..3 step 1 |
| Latte | 200 ml | ml | 0..400 step 50 |
| Grilled chicken | 180 g | g | 0..360 step 10 |
| Rice & beans | 200 g | g | 0..400 step 10 |
| Salad + olive oil | 100 g | g | 0..200 step 10 |
| Yogurt | 170 g | g | 0..340 step 10 |
| Granola | 30 g | g | 0..60 step 10 |
| Baked salmon | 160 g | g | 0..320 step 10 |
| Roasted vegetables | 150 g | g | 0..300 step 10 |
| Sweet potato | 150 g | g | 0..300 step 10 |

(The handoff's hand-authored min/max/step differ for some rows — e.g. chicken 0..300, granola step 5. The DESIGN-SPEC heuristic is binding; the handoff values are sample data, not rules.)

Edge rows for the same test: `(null, "egg") → 0..3 step 1` · `(1.5, "scoop") → 0..4 step 1` (q rounds to 2) · `(null, "g") → omitted` · `(0, "ml") → omitted` · `(0.4, "g") → 0..10 step 10` · `(7, "g") → 0..10` · `(8, "g") → 0..20` · `(25, "ml") → 0..50 step 50` · `(" G ", …)` and `"Grams"` classify as g · `(200, null) → 0..400 step 1` (countable).

---

## 4 · Portions overlay — storage, endpoints, semantics

### 4.1 Migration `V008__plan_portions.sql` (expand-only, ADR-0002)

```sql
-- V008 — eating-plan portion overlay (meal-plan round, CEO 2026-07-22 #1).
-- One row per user: the sparse {PlanItem.id: qty} map for the CURRENT
-- eating_plan version, PLAINTEXT jsonb (CEO amendment A1 2026-07-22:
-- portions are not sensitive — no per-user DEK, no AAD). plan_id pins the
-- version the overlay belongs to; a new import resets it (row deleted).
-- Portion changes never create plan versions. ON DELETE CASCADE cleans it
-- on account deletion — plain FK cascade, no crypto-shred involvement.
-- Expand-only (CREATE TABLE only — rollback gate, spec §6).

CREATE TABLE plan_portions (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,      -- C1
    plan_id    uuid NOT NULL REFERENCES eating_plan (id) ON DELETE CASCADE,   -- C1: the version this overlay is bound to
    portions   jsonb NOT NULL,                                                -- C1: plaintext {itemId: qty} (CEO A1)
    updated_at timestamptz NOT NULL DEFAULT now()                             -- C1
);
```

One row per user (PRIMARY KEY user_id) — replace-on-write upsert, the `vacation` pattern. `portions` holds the JSON object `{"it-3": 3, "it-7": 250}` exactly as on the wire.

### 4.2 No crypto (CEO amendment A1)

Portion overrides are **not sensitive** — plaintext jsonb. Explicitly NOT done: no `AadContext`
entry, no `CryptoService` calls on this table, no `SmokeTest` C3 listing, no crypto-shred wiring.
Account deletion cleans the row via the plain `ON DELETE CASCADE` FK (ADR-0004's cascade half —
the shred half doesn't apply here). The eating-plan **doc blob itself keeps its existing
encryption** — this round doesn't touch it (A3: no repo-wide decrypt sweep).

### 4.3 `PUT /v1/plan/portions` — server flow

1. Load current eating-plan version; none → **404**.
2. Decrypt doc (doc blob keeps its existing encryption, A3); read the **stored** item ids and portion bounds (no derivation, §2/A2).
3. Request map validation:
   - \> 200 keys, or any value non-numeric / NaN / ±Infinity / negative → **400** (problem+json says which key).
   - Any key not a stored item id of the current version → **422**, detail lists the offending ids, whole request rejected (no partial apply). (A pre-0.6.0 id-less doc 422s on every key — re-import is the path out, §2.)
4. Clamp every value: `snap = round(q / step) · step` (half-up), then `coerceIn(min, max)`. Items without `portion` bounds (§3.3 omitted): accept qty ≥ 0 as-is, only floor at 0.
5. Empty map after validation → delete the row (**200** `{}`). Else upsert `(user_id, plan_id = current.id, portions = map)` — plaintext jsonb (A1).
6. Respond **200** with the map as stored. Idempotent by construction; no Idempotency-Key. Last-write-wins under concurrency (matches the app's offline outbox design).

### 4.4 Reset / prune semantics (CEO A5)

- **POST /plan (new version):** delete the user's `plan_portions` row in the same transaction (`@Transactional` on the import path; eating-plan table only). → Overlay RESETS on new version; every item shows its default qty.
- **PUT /plan (doc edit, same version):** after saving, for each overlay key (if a row exists):
  - id no longer present in the new doc → **prune** the key (removed item);
  - id present but the item's `quantity` **or** `unit` differs from the previous doc → **delete** the key (edited item — its bounds changed, override resets; name-only edits keep it);
  - otherwise → **keep verbatim** (untouched item; bounds unchanged by construction, so no re-clamping exists).
  Delete the row if the map ends empty. Plain jsonb read/write — no crypto (A1).
- **GET /plan:** attach `portions` only when the row exists AND `row.plan_id == current.id`; on mismatch (any path that changed the version without cleanup) treat as absent and lazily delete the row. History responses never touch the overlay.
- **Trim/cascade:** `plan_id … ON DELETE CASCADE` is the backstop if a version row is ever deleted out from under the overlay (trim only deletes old versions, never the current one — the explicit POST-reset is the real mechanism).

### 4.5 Files

`repository/plans/PlanPortionsRepository.kt` (get/upsert/delete — plain jsonb, no crypto),
overlay logic inside `service/plans/PlanService.kt` (it owns doc typing already — no new service),
endpoint on `controller/plans/PlanController.kt`.

---

## 5 · Parse extensions

### 5.1 `/parse/eating-plan` — per-unit micros (`service/ai/PlanPrompts.kt`)

Tool `record_eating_plan`, item properties gain:

```kotlin
"microsPerUnit" to mapOf(
    "type" to "object",
    "properties" to mapOf(
        "fiberG" to mapOf("type" to "number"),
        "sodiumMg" to mapOf("type" to "number"),
        "ironMg" to mapOf("type" to "number"),
        "calciumMg" to mapOf("type" to "number"),
    ),
),
```

`EATING_PLAN_SYSTEM` prompt delta — append (keep the existing no-advice/injection framing untouched):

```
nutritionPerUnit and microsPerUnit are PER SINGLE UNIT of the item — per 1 g,
per 1 ml, per 1 egg/slice — never per 100 g and never per serving. For a
"150 g chicken" item, kcal per unit is about 1.65, not 165. When the plan
states or you can reasonably estimate them, fill microsPerUnit with per-unit
fiberG (g), sodiumMg (mg), ironMg (mg), calciumMg (mg). Omit any value you
cannot estimate — never invent micros. Keep filling the daily `micros` array
as before; it is the fallback for items without microsPerUnit.
```

(The per-single-unit sentence also hardens the existing `nutritionPerUnit` against the classic per-100 g failure — evaled in §5.3.)

DTO: `model/ai/PlanDtos.kt` — `PlanItem` gains `val id: String? = null`, `val microsPerUnit: MicrosPerUnit? = null`, `val portion: PortionBounds? = null`; new small data classes `MicrosPerUnit(fiberG, sodiumMg, ironMg, calciumMg — all Double? = null)` and `PortionBounds(min: Double, max: Double, step: Double)` (in `model/ai/PlanDtos.kt`; `@JsonInclude(NON_NULL)` like siblings). Negative micro values from the model → coerce to null (drop, don't clamp — a negative estimate is garbage).

`PlanParseService`: after deserialization, decorate every item with `portion` from `PortionBounds` heuristic (§3) before returning. Parse responses carry **no ids** (ids are a save-time concern; the app POSTs the confirmed draft and gets ids back).

### 5.2 `/parse/training-program` + capture workout parse — muscles & roles

Tool `record_training_program`, exercise properties gain (both were missing; D-11):

```kotlin
"muscles" to mapOf(
    "type" to "array",
    "items" to mapOf("type" to "string", "enum" to MUSCLE_VOCAB),
),
"muscleRoles" to mapOf(
    "type" to "array",
    "items" to mapOf(
        "type" to "object",
        "required" to listOf("name", "role"),
        "properties" to mapOf(
            "name" to mapOf("type" to "string", "enum" to MUSCLE_VOCAB),
            "role" to mapOf("type" to "string", "enum" to listOf("primary", "secondary")),
        ),
    ),
),
```

`TRAINING_PROGRAM_SYSTEM` prompt delta — append:

```
For each exercise, list the muscles it works using only the allowed names,
and muscleRoles marking each as primary (a main mover) or secondary
(assisting/stabilizing). Only muscles the exercise genuinely works — omit
both fields if you cannot tell.
```

The capture path (`record_log_entries` tool in `service/ai/ParseService.kt` / its preamble): add the same `muscleRoles` shape to the exercise schema there, so captured workouts feed the muscle map with roles too ("Program/workout parse extraction extended accordingly" — DESIGN-SPEC).

**Shared vocabulary extraction:** move `MUSCLES` + `MUSCLE_ALIASES` + `mapMuscle` out of `EntryService`'s companion into a shared pure object `model/Muscles.kt` (`val VOCAB: List<String>`, `fun map(raw: String): String?`, `fun mapAll(raw: List<String>?): List<String>?`). `EntryService` delegates (behaviour unchanged); `PlanPrompts`/`PlanParseService` reuse it.

**Server-side normalization rule (both paths, applied after deserialization):**
1. Map each `muscleRoles[].name` through `Muscles.map` (alias fold); drop unmappable entries.
2. Dedupe by mapped name; if the same muscle appears as both primary and secondary, **primary wins**.
3. `muscles` absent but roles present → derive `muscles` = mapped role names (order preserved). `muscles` present → map/dedupe it as today, independently. Roles never derived from bare muscles (D-5).
4. Both absent → both stay absent (app uses its base-opacity fallback).

DTOs: `model/entries/EntryDetail.kt` `Exercise` gains `val muscleRoles: List<MuscleRole>? = null`; `model/ai/PlanDtos.kt` `PlanExercise` gains `val muscles: List<String>? = null` and `val muscleRoles: List<MuscleRole>? = null`. One shared `data class MuscleRole(val name: String, val role: String)` next to `Muscles`. Role values outside primary/secondary → drop the entry (tool enum makes this rare; PDFs can surprise).

Stored docs: the program doc blob stores whatever the normalized draft contains — encrypted verbatim like today, nothing new server-side.

### 5.3 Eval fixtures (mirror the BE-014 pattern: golden WireMock + optional live tag)

**A4 rule (binding):** the handoff §1.2 table is EXAMPLE data. It may serve as deterministic
golden TEST input, and every assert is **computed from the fixture's own per-item data** —
no fixture, test, or product code hard-codes 1,756.2 or any other table number as product truth.
In production, all nutrition values come from Claude parse estimates at import; totals are
always computed from per-item data.

New `src/test/resources/eval/plan-parse-cases.json` + `PlanParseEvalTest` (dynamic tests over golden Claude responses, exactly the `ParseEvalTest`/`ParseEvalCases` structure). Live twin rides the existing `liveEval` gradle task via a `@Tag("live")` test, same cases, looser asserts.

Concrete cases:

1. **`reference-11-item-plan`** — golden tool output = the handoff §1.2 table translated to contract shape (4 meals, 11 items, per-unit macros AND micros exactly as listed). Assert: deserializes; every item gets the §3.4 expected `portion`; recomputed doc totals Σ(per-unit × qty) match §7 within ±1 unit per figure (guards per-single-unit semantics end to end).
2. **`plan-without-micros`** — golden output with no `microsPerUnit` anywhere (legacy-shaped) → fields absent in the response (NON_NULL), `portion` still derived, daily `micros` array passes through untouched (the app's static-chips fallback source).
3. **`per-100g-trap`** — input text "150 g grilled chicken breast (165 kcal per 100 g)". Golden asserts the request's system prompt contains the per-single-unit instruction (WireMock request capture). Live-tagged twin asserts the returned item's `nutritionPerUnit.kcal ∈ [1.2, 2.2]`.
4. **`program-with-roles`** — golden leg-day program per handoff §2.2 (quads/glutes/hamstrings primary; calves/core/lowback secondary, spread over 6 exercises). Assert roles survive normalization, `muscles` derived where the golden omits it, an entry with role `"tertiary"` is dropped.
5. **`program-alias-fold`** — golden with `muscleRoles: [{name:"lats",…}]`-style non-enum name (simulating drift) → folded to `back`; duplicate primary+secondary `back` collapses to one primary `back`.
6. **capture path** — one new case in `parse-text-cases.json`: "leg day: squats and RDLs" golden with per-exercise `muscleRoles` → `EntryService` maps/dedupes and derives `muscles` (asserted through the existing eval assert helper, extended).

### 5.4 Parse observability + output budget (devops asks, same code path — rides BE-039)

- **One INFO line per eating-plan parse** with the ParseMetrics counters that are otherwise
  trapped in the in-memory SimpleMeterRegistry:
  `parse plan=eating outcome=<ok|error> inputTokens=<n> outputTokens=<n>` — this is what makes
  parse cost observable in CloudWatch (devops-spec §5 probe reads it post-deploy).
- **Review `plan-max-output-tokens: 2048`**: per-item micros + portion make the tool output
  ~1.5–2× larger. Validate against the 11-item reference fixture's golden response size and
  bump if the margin is thin (the fixture asserts non-truncation by deserializing).

---

## 6 · Devops handshake — deploy ownership (this round deploys via Terraform, not a CLI clone)

The V008 migration rides the next backend image (Flyway on boot), same ECS/RDS/pipeline — DESIGN-SPEC DevOps section. No new AWS resources, no SSM changes, no new env vars from backend.

**But the deploy itself is split with devops (OPS-024, devops-spec §2).** Terraform is 3 releases behind live (`vita:5→7` were CLI task-def clones; TF still holds `app_image_tag = "909262c"` and lacks `PUBLIC_BASE_URL`), so a later naive `terraform apply` would roll prod back three releases. This round's task-def registration/rollout therefore goes through **Terraform** (`terraform apply -var app_image_tag=<tag>` → registers `vita:8`), re-converging the drift as a side effect. Another CLI clone is forbidden this round.

Ownership split — **exactly one ticket registers the task-def, and it is OPS-024**:

- **BE-041 (backend):** build + push the image from the committed SHA (arm64 → ECR `vita-api`, record tag + digest), hand tag/digest to devops, then own the post-rollout **live functional probes**.
- **OPS-024 (devops):** Terraform reconcile (`PUBLIC_BASE_URL` into TF), rollback rehearsal, `terraform apply -var app_image_tag=<tag>`, service rollout wait, Flyway/CloudWatch boot validation.

Hard ordering (gate, not a suggestion):

1. BE-041 builds + pushes the image (tag/digest to OPS-024).
2. OPS-024 Terraform reconcile **+ rollback rehearsal passes** — current prod image (`be035`) boots clean against a V008-migrated local DB (Flyway future-migration validation; evidence in the OPS-024 ledger). No prod apply before this passes.
3. OPS-024 deploys: `terraform apply -var app_image_tag=<tag>` → `vita:8`, rollout COMPLETED, Flyway `008` clean in `/ecs/vita`.
4. BE-041 runs the live probes and closes the round.

Corollary for BE-038: **V008 must be CREATE TABLE only** (no ALTER of `eating_plan`, no NOT NULL column without default on existing tables) — otherwise the rollback claim in devops-spec §6 is void.

---

## 7 · Reference-fixture expected totals (computed 2026-07-22; D-9/A4)

**Test-cross-check values only** (A4): these are Σ(per-unit × default qty) computed over the
handoff's 11 example rows — useful to sanity-check the fixture asserts, never a product constant.

| figure | value |
|---|---|
| kcal | **1,756.2** (the handoff prose "~1,880" disagrees with its own table — both are sample data; the formula is what's binding) |
| protein | 145.4 g |
| carbs | 154.2 g |
| fat | 56.7 g |
| fiber | 20.1 g |
| sodium | 1,280.9 mg |
| iron | 10.3 mg |
| calcium | 609.2 mg |

Display formulas (app-side, listed for fixture cross-checks): `planKcal = '~' + round(tK)`; bar % = `round(g / (max(tP,tC,tF)·1.1) · 100)`; micros chips `Fiber x.x g / Sodium n mg / Iron x.x mg / Calcium n mg`.

---

## 8 · Test plan (all inside `./gradlew check`; suite is 157 green today — must stay green)

**PortionBoundsTest** (pure unit, table-driven): every §3.4 row + edge rows; half-up rounding cases (7 g → 10, 8 g → 20); classification cases (case/whitespace, "grams", "millilitres", "cup", null unit).

**PlanFlowTest extensions** (Testcontainers, existing file):
- POST /plan assigns `it-1…it-N` in document order; response carries ids + recomputed `portion`; client-sent ids/portion on POST are ignored.
- Id-less stored doc (pre-0.6.0 shape, inserted via the service): GET returns it without ids (no derivation, A2); a subsequent PUT save assigns fresh ids.
- PUT /plan preserves round-tripped ids; new item gets `it-{max+1}`; duplicate ids → 400.
- History: responses carry whatever ids were stored at save time, never a `portions` key; frozen bytes untouched by reads.

**PlanPortionsFlowTest** (new, Testcontainers):
- PUT stores; GET /plan returns the map; PUT again with the same body → same 200 body (idempotent); PUT with changed body replaces fully (keys absent from the new body are gone).
- Unknown itemId → 422 with offending ids in detail; nothing applied.
- Clamp: qty above max → max; off-step (e.g. 187 on step 10) → snapped; negative value → 400; > 200 keys → 400.
- No current plan → 404. Empty map → row deleted, GET omits `portions`.
- **Reset-on-new-version:** PUT portions → POST /plan (new version) → GET has no `portions`; DB row gone.
- **A5 edit semantics:** PUT portions for it-2/it-3/it-5 → PUT /plan that removes it-5, changes it-2's quantity, and leaves it-3 untouched → GET shows ONLY it-3's override, verbatim (it-5 pruned, it-2 reset).
- **Cascade:** account purge deletes the row via plain FK cascade (AccountFlowTest extension). No crypto asserts — the column is plaintext jsonb by design (A1); no SmokeTest C3 entry.

**Parse (golden/WireMock):** the six §5.3 cases; PlanParseFlowTest existing cases stay green (tool-schema change must not break old goldens — additive properties only).

**EntryFlowTest extension:** POST /entries workout with `muscleRoles` (incl. alias + dup) → normalized roles + derived muscles readable back.

**Contract compatibility:** redocly exit 0; the existing app-types round-trip is the app team's `api:check` — backend asserts old-shape docs (no new fields) still validate against v0.6.0 (all additions optional) via one PlanFlowTest case POSTing a v0.5.0-shaped body.

---

## 9 · Ticket map (dependency order)

| Ticket | Title | Model | Depends on |
|---|---|---|---|
| BE-036 | Contract v0.6.0 additive diff + ADR-0017 | Sonnet (simple) | — |
| BE-037 | PlanItem ids + portion-bounds heuristic at plan save (no backfill — A2) | Opus 4.8 (complex) | BE-036 |
| BE-038 | Portions overlay: V008 + PUT /plan/portions + GET /plan decoration | Opus 4.8 (complex) | BE-037 |
| BE-039 | Eating-plan parse: microsPerUnit + portion decoration + eval fixtures | Opus 4.8 (complex) | BE-037 (heuristic), BE-036 |
| BE-040 | muscleRoles: program parse + capture parse + shared vocabulary | Opus 4.8 (complex) | BE-036 (parallel with 037-039) |
| BE-041 | Ship the round: image build+push + live verify (task-def/rollout = OPS-024 Terraform) | Sonnet (simple) | BE-037..BE-040, then OPS-024 deploy gate (§6) |

Done = in production (`./gradlew check` green, deployed image, live probes green). The app consumes v0.6.0 after BE-036 lands (types regen) but nothing app-side blocks backend order.

---

## 10 · Questions for the CEO

None. The former Q1 (portion overrides across plan edits) was answered by CEO amendment **A5**
(2026-07-22): an edit touches only the edited item — untouched items keep their overrides,
the edited item's override resets, removed items are pruned; re-import still resets all. Baked
into §4.4/D-2.
