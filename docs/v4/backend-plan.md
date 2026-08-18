# Vita v4 — Backend implementation plan

**Session:** planning round, 2026-08-18 · **Author:** backend team lead · **Status:** proposal, awaiting CEO review
**Inputs:** `docs/v4/README.md` (binding handoff) · `docs/v4/Vita Prototype v4.dc.html` (state model, read for
ambiguity) · contract `docs/contracts/vita-api-v0.yaml` v0.7.0 · ADR-0003 / ADR-0016 / ADR-0018 ·
`backend/Next_session.md` (V001..V009 live, task-def `vita:9`).

**No code was written this session.** This document is the build-ready spec; tickets are proposed, not filed.

---

## 0 · Headline

v4 is a **structural rethink of the app, not of the backend**. The day-record model — the one genuinely new
domain concept — maps onto the log entries that already exist: a meal moving `planned → done/adjusted/skipped`
**is** a meal log entry, now carrying a pointer back to the plan meal it fulfils. Close-the-day is a batch of
those same writes. Retro-close is the same batch with a later `logged_at`. Everything else v4 adds is either
already shipped (habits/check-ins, vacation, plan editing, per-exercise muscles, async PDF import) or belongs
on the device (composition flags, habit definitions, notifications, trends).

Net backend footprint: **one CHECK-widening migration, ~8 additive contract fields, one new entry type, one
plan-aware capture change**. Plus one recommended *deletion* (§1.2).

---

## 1 · Scope summary — backend vs device-local

### 1.1 Recommendation table

| v4 surface | Recommendation | Rationale |
|---|---|---|
| Meal status `done`/`adjusted`/`skipped` for a day | **Backend** — additive fields on the existing `meal` entry | CEO Round-10 #1: *outcomes* persist server-side. This is the log itself. |
| Meal status `planned` | **Not stored anywhere** | `planned` = "in the plan, no record yet". Derived: plan minus records. Storing it would store an absence. |
| Day status `unrecorded` / `as planned` / `adjusted` | **Derived, no storage** | Any meal record on the day → recorded; all `done` → as planned; any `adjusted`/`skipped` → adjusted. Zero rows, zero endpoints. |
| "Close the day" | **Backend, as the N meal/workout records it writes** | The prototype's `closed:true` flag is UI state (it has a Reopen that does *not* revert the records it wrote). The durable truth is the records. |
| Retro-close on a past day | **Backend, same records, dated to that day** | Honesty caption ("closed later", "Closed as planned — later, by you") is derivable from the existing `logged_at` vs the day's end. No new field. |
| Retro workout logging on a past day (`pastWk`) | **Backend, existing `workout` entry** | Same mechanism as retro-close. |
| Workout `done`/`adjusted` | **Backend** — additive fields on the existing `workout` entry | Symmetric with meals. |
| Weight — **manual** entry | **Backend** — new `weight` entry type | User-authored, not re-syncable from anywhere. Same class as a meal. |
| Weight — **Health Connect** reading | **Device-local — ADR-0016 stands** | Re-syncable mirror of an external source; no server aggregation (D4). See Q2. |
| Habit definitions (name, time, weekday circles) | **Device-local** — already is (`app/.../db.ts` `habits` table has `days` JSON `boolean[7]`, `time`, `enabled`) | D1 + CEO Round-10 #1 ("habit definitions may stay device-local"). v4 changes the *form*, not the storage. |
| Per-habit notification switch | **Device-local** | CEO 2026-07-13 post-kickoff #3: check-in/habit notifications are local on device, no server push in v1. |
| Habit answers (check-ins) | **Backend — already shipped** (BE-024, `checkin` entry type, `habitId:date` idempotency) | No change. Habit detail sheet + dot strips read `GET /entries?type=checkin&from=&to=`. |
| Composition flags ("what Vita keeps": `meals/water/move/habits/weight`) | **Device-local kv** | Render-gating config, not an outcome. Re-chosen in onboarding step 2 on any fresh install. Flip path in §2.4. See Q1. |
| Onboarding step 1 (name) | **Backend — existing** `PATCH /me` | No change. |
| Add-a-meal form (name · time · total kcal) | **Backend — existing** `PUT /plan` | The form's own model already synthesizes one item (`qty 1`, unit `serving`, kcal-per-serving), which satisfies `PlanMeal.items` minItems 1. **No contract relaxation needed.** |
| Replace plan via PDF / import training program | **Backend — already shipped** (async parse, `plan_parse_job`, `status:"review"`) | No change (§5). |
| Capture (voice/text/photo) → **plan delta** | **Backend** — plan-aware parse | The plan lives server-side, encrypted, with stable `it-N` ids. Matching on-device would mean fuzzy string matching against item names the server already has ids for. |
| Portion modal "only counts for today" | **Device-local** — and **delete `plan_portions`** (§1.2) | See below. |
| "Pick your usual" (`usualSwapIndex` / `usualOptionIndex`) | **Backend — already shipped** | Persistent plan-level choice. Unchanged. |
| Trends (record counter, W/M/Y series, muscle aggregate, habit strips, weight line) | **Device-local** | CEO D4: trends are client-side. Backend already serves the raw reads. |
| Muscle map everywhere (workout card, past days, Trends chips, per-muscle sheet) | **Backend — already shipped** (`Exercise.muscleRoles`, v0.6.0/BE-040) | Aggregation is client-side. No change. |
| Vacation | **Backend — already shipped** (`GET/PUT /me/vacations`) | No change. |
| Export (recipient-shaped PDF) | **Device-side** | No change. |
| Account: Sign out / Delete my data | **Backend — already shipped** (`POST /auth/sign-out`, `DELETE /account`, 7-day grace + crypto-shred) | No change. |
| Health Connect toggle row | **Device-local** | ADR-0016. |
| PDF parse target model | **No change vs v3** | §5. |

### 1.2 Recommended deletion: `plan_portions` (V008) and `PUT /plan/portions`

The portions overlay was built (BE-038) *before* a day-record model existed, to answer "the user moved the
slider — where does that live?". Its own modal copy says **"only counts for today"**, but the table is bound to
the plan *version*, not to a day — the overlay silently persists into every following day. That mismatch was
tolerable in v3. In v4 it is redundant **and wrong**:

- A portion change on a **recorded** meal is captured exactly by the meal record (the record carries the
  quantities actually eaten, and flips the meal to `adjusted`).
- A portion change on a **not-yet-recorded** meal is transient today-only UI state until the user confirms —
  device-local by nature, and it is what the prototype does (`qtyOv` is an unkeyed today-scoped map).

**Recommendation:** drop the table + endpoint in v4 (`V011 DROP TABLE plan_portions`, remove
`PlanPortionsRepository`, `putPortions`, the `portions` key on `GET /plan`, and `pruneOverlayAfterEdit`).
That deletes a table, an endpoint, a repository, ~120 lines of prune/clamp logic, and a whole class of
"stale overlay" bugs. `PortionBounds` on `PlanItem` **stays** — the slider still needs its min/max/step.

This needs app-team agreement (they hold `portions` in the client model today), so it is filed as its own
ticket and can be dropped without blocking anything else. See **Q3**.

---

## 2 · Data model

### 2.1 What changes

| Change | Migration | Class (ADR-0003) |
|---|---|---|
| `log_entry.type` CHECK gains `'weight'` | **V010** (one `ALTER`, expand-only, same shape as V006) | C1 |
| Meal plan-linkage + status | **none** — rides `log_entry.detail_enc` | **C3**, per-user DEK, AAD `entry.detail` (unchanged envelope) |
| Workout plan-linkage + status | **none** — rides `detail_enc` | **C3**, same |
| Weight value | **none** — rides `detail_enc` | **C3**, same. Body weight is sensitive; it is encrypted like every other detail, for free, by riding the existing path. |
| `PlanMeal.id` (`m-1`…`m-N`) | **none** — rides `eating_plan.doc_enc` | **C3**, per-user DEK, AAD `eating_plan.doc_enc` (unchanged) |
| Drop the portions overlay (§1.2, optional) | **V011** `DROP TABLE plan_portions` | n/a |

**No new tables. No new crypto decisions.** Every new field lands inside a blob that is already AES-256-GCM
under the per-user DEK, already AAD-bound to `userId:table.column`, already crypto-shredded on account
deletion (ADR-0003/0004). The plaintext-jsonb precedent (CEO A1, `plan_portions`) is **not** extended — if
§1.2 is accepted it is retired.

### 2.2 Deliberately NOT added

- **No `day_record` table.** Day status is derived (§1.1). A day-level row would duplicate what the meal
  records already say and would need its own reconciliation with them.
- **No denormalized `weight_kg` column.** The C2 columns exist so SQL can `GROUP BY` for trends — trends are
  client-side (D4), so nothing would ever read it. `weight` denormalizes to all-null, exactly like `checkin`.
- **No `closedAt` / `closedBy` field.** `logged_at` (already on every row) carries when the record was made;
  a record written by the one-tap close and one written by an individual confirm are the same user assertion
  and the product treats them identically.
- **No plan-version pinning on day records.** A day record is self-describing (it carries `title`, `items`,
  `totals`) so it renders correctly even after the plan is re-imported; only the `planMealId` back-pointer
  goes stale, and nothing reads it for past days.

### 2.3 Migration plan

```
V010__log_entry_weight_type.sql      -- expand-only; mirrors V006 exactly
  ALTER TABLE log_entry DROP CONSTRAINT log_entry_type_check;
  ALTER TABLE log_entry ADD CONSTRAINT log_entry_type_check
      CHECK (type IN ('meal', 'water', 'workout', 'checkin', 'weight'));

V011__drop_plan_portions.sql         -- ONLY if §1.2 / Q3 is accepted
  DROP TABLE plan_portions;
```

Destructive migrations are authorized pre-production (CEO A2) but **are not needed** for the core of v4 — V010
is expand-only and V011 drops a table the product no longer uses. What A2 *is* needed for: plans saved before
v0.8.0 carry no `PlanMeal.id` (no backfill, A2), so the CEO **re-imports the plan once** after deploy — one
action, already the normal flow. See Q6.

### 2.4 Flip path for composition flags (not built)

If durability is later required: one `user_settings` table `(user_id PK, settings_enc bytea, updated_at)` +
`GET/PUT /me/settings` carrying an opaque encrypted blob the server never interprets — a copy-paste of the
`vacation` table/service/controller trio (~90 lines). Recorded here so a future session doesn't re-derive it.

---

## 3 · Contract v0.8.0 — precise diffs

**All additive.** No field is removed, no type narrowed, no status code changed — except the optional §1.2
removal of `PUT /plan/portions`, which would make it **0.8.0 breaking** and is therefore isolated in its own
ticket so the CEO can take it or leave it.

Vocabulary note: the prototype uses shorthand literals `planned | done | adj | skip`. The contract uses the
full words the handoff prose uses — `done | adjusted | skipped` — and `planned` is not a wire value at all
(§1.1).

### 3.1 `MealDetail` — plan linkage (new)

```yaml
    MealDetail:
      type: object
      required: [items]
      properties:
        title: { type: string, maxLength: 100 }
        items:
          type: array
          minItems: 0            # was 1 — see planStatus "skipped" below
          items: { $ref: "#/components/schemas/MealItem" }
        totals: { $ref: "#/components/schemas/MacroTotals" }

        # ── v0.8.0 (v4 day record) ──────────────────────────────────────
        planMealId:
          type: string
          maxLength: 40
          description: >-
            The PlanMeal.id ("m-1"…"m-N") this record fulfils. Absent for a
            free-form meal that isn't in the plan (the v3 behaviour). The
            record stays self-describing (title/items/totals) so it renders
            correctly after the plan is re-imported and this id goes stale.
        planStatus:
          type: string
          enum: [done, adjusted, skipped]
          description: >-
            The day record status for this plan meal. "done" = eaten as
            planned; "adjusted" = eaten with swaps/portion changes/omissions;
            "skipped" = the user recorded not having it. There is no
            "planned" value — a plan meal with no record is, by definition,
            unrecorded. Requires planMealId.
        planOptionIndex:
          type: integer
          minimum: 0
          description: >-
            Which MealOption of the plan meal was eaten (index into
            PlanMeal.options); absent = the meal's own `items`. Requires
            planMealId.
```

Server rules (BE-048):
- `items` may be empty **only** when `planStatus == "skipped"`; otherwise `400` (unchanged message).
  A skipped meal denormalizes to `kcal = 0` (its `totals` are all zero), which is what the day counters want.
- `planStatus` / `planOptionIndex` without `planMealId` → `400`.
- `planStatus` on a non-`meal` type → n/a (typed detail; see §3.3 for workouts).
- Fields are stored verbatim inside the encrypted detail. The server does **not** validate `planMealId`
  against the current plan (plans are versioned and the record may outlive the version — validating would
  reject legitimate retro-closes).

### 3.2 `MealItem` — swap provenance (new)

```yaml
    MealItem:
      properties:
        # … unchanged …
        replacesItemId:
          type: string
          maxLength: 40
          description: >-
            The PlanItem.id this item stands in for. Set by the plan-aware
            parse and by the app when the user swaps or re-portions a planned
            item, so the day record can render "White rice · 150g → Sweet
            potato · 200g · −23 kcal". An unchanged planned item carries its
            own id here. Absent for an item that isn't in the plan at all.
            Server-opaque.
```

The "−23 kcal" delta is **not** a wire field: the app has both the plan item and the recorded item and
subtracts. No server arithmetic, no drift.

### 3.3 `WorkoutDetail` — plan linkage (new)

```yaml
    WorkoutDetail:
      properties:
        # … unchanged …
        planDay:
          type: string
          maxLength: 100
          description: The ProgramDay.name this session fulfils ("Leg day"). Absent for an off-program workout.
        planStatus:
          type: string
          enum: [done, adjusted, skipped]
          description: Same semantics as MealDetail.planStatus. Requires planDay.
```

`adjusted` covers the prototype's per-exercise override case (`exOv` → `done` when every exercise is on,
else `adj`). Exercise-level detail already rides `exercises[]`.

### 3.4 New entry type `weight` + `WeightDetail`

```yaml
    NewEntry:
      properties:
        type:
          enum: [meal, water, workout, checkin, weight]

    EntryDetail:
      oneOf:
        - $ref: "#/components/schemas/MealDetail"
        - $ref: "#/components/schemas/WaterDetail"
        - $ref: "#/components/schemas/WorkoutDetail"
        - $ref: "#/components/schemas/CheckinDetail"
        - $ref: "#/components/schemas/WeightDetail"        # new

    WeightDetail:
      type: object
      description: >-
        One manually logged body-weight reading (v4). Health-Connect readings
        are NOT sent here — they stay device-local (ADR-0016); this endpoint
        only ever receives a value the user typed, which is why LogEntry.source
        stays "user". Encrypted at rest in the entry detail like every other
        type. No goal, no delta, no judgement — a reading and its time.
      required: [kg]
      properties:
        kg:
          type: number
          minimum: 20
          maximum: 500
          description: Always kilograms on the wire (metric-only, APP-071).

    # GET /entries `type` filter enum
        - name: type
          schema:
            items:
              enum: [meal, water, workout, checkin, weight]
```

Idempotency: the app chooses the key. `weight:<date>` gives one reading per day (PATCH to correct it, same
pattern as check-ins); a plain uuid allows several. **The server imposes neither** — it is app-side product
copy. Recommended to the app team: `weight:<date>`, matching the prototype's single `wtManual` slot.

### 3.5 `PlanMeal.id` — stable meal ids

```yaml
    PlanMeal:
      properties:
        id:
          type: string
          maxLength: 40
          description: >-
            Server-generated stable meal id ("m-1"…"m-N" in document order),
            assigned when a plan version is saved — exactly the PlanItem.id
            rules: clients MUST round-trip it unchanged on PUT /plan, POST
            assigns fresh ones, duplicates are a 400, and there is NO backfill
            (docs saved before 0.8.0 read back id-less and need one re-save or
            re-import before day records can point at them).
```

Implementation rides `PlanService.decorate()` (which already does exactly this for `it-N`): one extra counter
over `draft.meals`, same fresh-vs-preserve branch, same `m-(max+1)` continuation on PUT.

### 3.6 Plan-aware capture — no new endpoint, no new response schema

`POST /parse/text` and `POST /parse/photo` keep their request and response shapes. What changes is what the
model is given and what it is allowed to fill in:

1. When the user has a current eating plan, the server builds a **compact plan digest** —
   `meal { id, name, time } → items [{ id, name, quantity, unit, kcalPerUnit }]` — and injects it into the
   parse prompt. **Swap lists are deliberately excluded** (up to 26 per item × 42 items would dominate the
   context for no gain: the model names the replacement food, the app matches it against the swap list it
   already holds).
2. The `record_log_entries` tool schema gains `planMealId`, `planStatus`, `planOptionIndex` on a meal detail
   and `replacesItemId` on a meal item — i.e. exactly the §3.1/§3.2 fields.
3. For a matched meal the model returns the **full resulting composition** (every item of the meal, changed
   or not, each with `replacesItemId`), so the app can render both the diff row and "everything else as
   planned". `planStatus` = `done` when nothing differs, `adjusted` otherwise.
4. No plan, or nothing matches → today's behaviour verbatim (a free-form meal draft, no plan fields). The
   422 "could not be interpreted" branch is unchanged.

Contract diff for this is **only prose** on the two endpoint descriptions (the fields are already added in
§3.1/§3.2). The app's "Match it to my plan" button therefore needs no new call.

Cost note: the digest is ~1.5–3k input tokens per capture on the real plan. At Sonnet input pricing that is
well inside the $10/mo Claude budget for ~5 users, but it is a real change to per-capture cost — see Q4.

### 3.7 Not changed (checked, listed so nobody re-derives it)

`Hydration`, `Supplement`, `MealOption`, `SwapOption`, `PortionBounds`, `EatingPlanDraft.status`
(`review`/`ready`), `plan_parse_job` async flow, `CheckinDetail`, `VacationRange`, `Exercise.muscleRoles`,
`ProgramDay.kcalEstimate`, all auth endpoints, `POST /uploads`.

---

## 4 · Work breakdown

Continuing after **BE-046**. Model per CEO cost rule (Round 7 #1).

### Wave 1 — contract-first (blocks the app team) · ~0.5 day

| Ticket | Title | Model | Depends on |
|---|---|---|---|
| **BE-047** | Contract v0.8.0 + ADR-0019 (v4 day record, weight entry, plan-aware capture) | Sonnet | — |

**Acceptance:** `docs/contracts/vita-api-v0.yaml` bumped 0.7.0 → 0.8.0 with exactly the §3.1–3.6 diffs;
`redocly lint` exit 0 (pre-existing operationId warnings only); `Doc/ADRs/ADR-0019-…md` records the five
decisions (day status derived not stored; retro-close = same records with a later `logged_at`; weight manual
→ backend / Health Connect → device-local; composition flags device-local; plan-aware capture reuses the
parse endpoints). **Orchestrator relays 0.8.0 to the app team the moment this lands** (ADR-0006) — every app
v4 ticket that touches the day record is blocked on it.

### Wave 2 — parallel, after BE-047 · ~1 day

| Ticket | Title | Model | Depends on |
|---|---|---|---|
| **BE-048** | Day-record fields on the entries write path | Opus | BE-047 |
| **BE-049** | `weight` entry type + V010 | Sonnet | BE-047 |
| **BE-050** | `PlanMeal.id` (`m-N`) in `PlanService.decorate()` | Opus | BE-047 |

**BE-048 acceptance** — `MealDetail` gains `planMealId`/`planStatus`/`planOptionIndex`, `MealItem` gains
`replacesItemId`, `WorkoutDetail` gains `planDay`/`planStatus` (`model/entries/EntryDetail.kt`); `normalize()`
enforces: empty `items` allowed iff `planStatus == "skipped"` (else 400), `planStatus`/`planOptionIndex`
without `planMealId` → 400, unknown `planStatus` value → 400; `denormalize()` unchanged for meals (a skipped
meal totals 0); fields survive a POST → GET → PATCH → GET round-trip byte-identically. Tests: +≈8 in
`EntryFlowTest` (done / adjusted-with-swap / skipped-empty-items / skipped-with-items-400 / orphan-planStatus-400
/ workout done+adjusted / round-trip / idempotent replay of the same close-the-day write).

**BE-049 acceptance** — `V010__log_entry_weight_type.sql`; `EntryType.weight`; `WeightDetail(kg)` with
range validation (20..500 → 400 outside); `denormalize` all-null; `weight` accepted in the `GET /entries`
`type` CSV filter; `POST /entries` with `Idempotency-Key: weight:2026-08-18` creates once, replays on identical
body, 409 on a different one, `PATCH` corrects it. Tests: +≈5.

**BE-050 acceptance** — `PlanMeal.id` stamped `m-1…m-N` on POST /plan, preserved on PUT /plan with
`m-(max+1)` for new meals, duplicate incoming meal id → 400, ids present on `GET /plan` and in
`GET /plan/history` versions, parse responses carry none (no backfill, A2). Note: the add-a-meal form's
synthesized single item (`quantity 1`, unit `serving`) already satisfies `items` minItems 1 and gets a
`PortionBounds` of `0..3 step 1` from the existing heuristic — verify in a test, no heuristic change.

### Wave 3 — after BE-047 + BE-050 · ~1–1.5 days

| Ticket | Title | Model | Depends on |
|---|---|---|---|
| **BE-051** | Plan-aware capture: plan digest + tool-schema extension for `/parse/text` and `/parse/photo` | Opus | BE-047, BE-050 |

**Acceptance** — `ParseService` loads the current plan (via `PlanService`, decrypting with the per-user DEK)
and passes a compact digest to `ClaudeClient.parseText/parsePhoto`; the `record_log_entries` tool schema and
`NUTRITION_PREAMBLE` gain the §3.6 fields + the matching instruction; no plan → identical behaviour to today
(a golden WireMock test proves the no-plan prompt is byte-identical to v0.7.0); 422 branch unchanged; the
existing per-user daily quota (BE-014) and `ParseMetrics` INFO cost line cover the new input tokens, with the
line asserted to include `inputTokens` so the digest cost is queryable in CloudWatch. Tests: WireMock goldens
for match / partial-match / no-match / no-plan, plus **one `@Tag("live")` eval** (`ANTHROPIC_API_KEY=… ./gradlew
liveEval`) feeding "had lunch as planned but swapped the rice for sweet potato" against the real imported
`meal-plan.pdf` plan and asserting the returned draft carries the lunch `planMealId`, `planStatus:"adjusted"`,
and a `replacesItemId` pointing at the rice item. ≈$0.02/run.

### Wave 4 — ship · ~0.5 day

| Ticket | Title | Model | Depends on |
|---|---|---|---|
| **BE-052** | v4 image build/push + prod probes | Sonnet | BE-048..051 |
| **OPS-0xx** | Terraform `app_image_tag` bump → task-def `vita:10` (devops board) | — | BE-052 image |

**Acceptance** — arm64 image → ECR; V010 applies on boot; `/health` 200; live probes: (1) POST a `weight`
entry, GET it back, PATCH it; (2) POST a meal with `planMealId`/`planStatus:"skipped"` and empty items → 201,
GET returns it verbatim; (3) re-import the plan, confirm `m-N` ids on `GET /plan`; (4) `POST /parse/text`
with the sweet-potato phrase against the live plan returns the plan delta. Asana BE-047..052 → Done.
**No new AWS resources, no new SSM params, no new env vars** — the devops ask is the image-tag bump only.

### Optional / CEO-gated

| Ticket | Title | Model | Note |
|---|---|---|---|
| **BE-053** | Retire the portions overlay: `V011 DROP TABLE plan_portions`, remove `PUT /plan/portions` + repository + prune logic + the `portions` key on `GET /plan` | Opus | §1.2. **Breaking** contract change → needs Q3 + app-team agreement. Net −1 table, −1 endpoint, ~−150 lines. |
| **BE-054** | Drop `units` from the contract and `users` | Sonnet | Metric-only shipped app-side (APP-071); `User.units` and `PATCH /me {units}` are dead. Pure deletion, zero product value — file in Backlog, do it when something else touches `/me`. |

**Ticket count: 6 core (BE-047..052) + 2 optional (BE-053, BE-054) + 1 devops.**

### Dependency graph

```
BE-047 (contract) ──┬── BE-048 (day-record fields) ──┐
   │                ├── BE-049 (weight + V010) ──────┤
   │                └── BE-050 (PlanMeal ids) ──┬─────┤
   │                                            │     │
   └────────────────────────────────────────────┴─► BE-051 (plan-aware capture) ──► BE-052 (ship) ──► OPS bump
                                                                                         ▲
                                                                        BE-053 (optional) ┘
```

---

## 5 · Claude parse: does the v4 target change anything?

**No.** README §6 says "As v3 handoff" and repeats the same ground-truth numbers the v3 live eval already
asserts (pre 109 · post 121 · lunch 702/679 · snack 72 · dinner 702/718/706/691 · day ≈1,706 vs report 1,716).
The v3 async pipeline (`POST /parse/eating-plan` → 202 → `plan_parse_job` poll → save as `status:"review"`,
20480-token cap, 300 s timeout, `PlanParseV3LiveEvalTest`) stands unchanged.

Two cosmetic notes, neither a backend change:

- The parse card's **"13 pages · 6 meals · 214 swap options"** is static demo copy in the prototype
  (`Vita Prototype v4.dc.html:1040-1041`) — three fade-in lines with `animation-delay` .5s/1s/1.5s. Ground
  truth measured from the real PDF is **5 meals / 274 swaps** (backend spec §2, v3), and the backend has no
  page count at all: it streams the PDF bytes to Claude and never opens them. Adding a page count would mean
  a PDF library (pdfbox) for one decorative line. **Recommendation: drop the "13 pages" line, or count pages
  app-side from the picked file.** See Q5.
- The plan is now imported from **Library / empty states** instead of onboarding step 3–4. Same endpoints,
  different entry point — app-side only.

---

## 6 · Risks

1. **Plan re-import invalidates `planMealId` back-pointers on past day records.** Mitigated by design: a
   record carries `title`, `items` and `totals`, so past days render correctly regardless; only the "which
   plan meal was this" linkage goes stale, and nothing reads it for past days. Accepted, documented in
   ADR-0019.
2. **The prototype's close-the-day and retro-close write *disjoint shapes*** (per-meal statuses + a boolean
   vs. a single day-offset key). This plan reconciles them into **one** representation — both write the same
   per-meal records, differing only in `occurred_at` (the day) vs `logged_at` (now). The app team must build
   to the reconciled model, not to the prototype's two shapes. Flagged for the app spec.
3. **Skipped meals with empty `items` widen `MealDetail`.** Any client summing `items` must tolerate an empty
   array and a zero `totals`. Backend-side the denorm is already `0`; app-side it is a review item.
4. **Plan digest cost on every capture** (§3.6, Q4). Bounded by the existing per-user daily parse quota, and
   the INFO cost line makes it queryable, but it is a genuine step up in per-capture input tokens.
5. **The Trends weight line will mix two sources** if Q2 stays as recommended (manual → backend, Health
   Connect → device-local): a reinstall keeps the typed readings and re-syncs the HC ones, which is the
   correct behaviour but means the backend copy is deliberately partial. Nobody should later "fix" this by
   backfilling HC weights into `/entries`.
6. **Contract 0.8.0 becomes breaking only if BE-053 is taken.** Keep BE-053 out of the same commit as
   BE-047 so the app team can adopt the additive half immediately.

---

## 7 · Questions for the CEO

**Q1 — Composition flags: device-local?**
"What Vita keeps" (`meals / water / movement / habits / weight`) would live only on the phone. Consequence:
reinstalling the app re-asks the question in onboarding step 2; nothing is lost because turning a flag off
never deletes data ("history stays"). *Default if you don't answer: device-local.* Flip path costs ~90 lines
(§2.4).

**Q2 — Weight: manual to the backend, Health Connect stays on the device?**
Recommendation: a weight the user types is user-authored and irreplaceable → it persists server-side
(encrypted). A weight read from Health Connect is a re-syncable mirror → it stays device-local, per ADR-0016.
*Default: as recommended.* Alternative if you want one uniform weight history: flip ADR-0016 for weight only
(then we also need a de-dup scheme for re-synced HC ranges — roughly +1 ticket).

**Q3 — Retire the portions overlay (BE-053)?**
The portion modal says "only counts for today" but the stored overlay persists across days. With the v4 day
record the overlay is redundant. Dropping it removes a table, an endpoint and ~150 lines. *Default if you
don't answer: keep it (do not run BE-053) — deletion is the better engineering answer but it is a breaking
contract change and I won't take it without your word.*

**Q4 — Plan-aware capture cost.**
Every voice/text/photo capture will now carry a ~1.5–3k-token digest of your plan so Vita can answer "rice →
sweet potato" precisely instead of guessing by name. Rough order: a few cents per hundred captures. Confirm
the $10/mo Claude budget absorbs it. *Default: proceed.* The cheap alternative (match on the device) is
materially worse at picking the right item.

**Q5 — "13 pages" on the parsing card.**
The backend never opens the PDF (it streams the bytes to Claude), so it cannot report a page count without
adding a PDF library for one decorative line. Drop the line, or have the app count pages from the file it
picked? *Default: drop the line; keep "6 meals · 214 swap options" (which comes from the parse result).*

**Q6 — One re-import after deploy.**
Plans saved before v0.8.0 have no meal ids and, per your A2 "no backfill" rule, won't get them retroactively.
You'd re-import `meal-plan.pdf` once after the v4 deploy (the normal flow, ~3 min). Confirm that's fine —
otherwise the alternative is a backfill-on-read path we deliberately deleted in the v3 round.

**Q7 — `units` cleanup (BE-054)?**
`User.units` and `PATCH /me {units}` are dead since metric-only shipped. Pure deletion, no product value.
Backlog it or skip it entirely?

---

## 8 · Rough size estimate

| Wave | Tickets | Size | Notes |
|---|---|---|---|
| 1 — contract | BE-047 | **~0.5 day** | Blocks the app team; run it first and alone. |
| 2 — schema + fields | BE-048, BE-049, BE-050 | **~1 day** | Three parallel agents, disjoint files (`model/entries` · `db/migration`+`EntryService` enum · `service/plans`). |
| 3 — capture | BE-051 | **~1–1.5 days** | The only genuinely new logic. Prompt/tool work + WireMock goldens + one live eval. |
| 4 — ship | BE-052 + OPS bump | **~0.5 day** | Image + V010 + 4 live probes. No new infra. |
| optional | BE-053 | ~0.5 day | Deletion; needs Q3. |
| optional | BE-054 | ~0.25 day | Deletion; backlog. |

**Core total: ~3–3.5 days of agent work across 4 waves.** Suite baseline 227 green; expect ~+20 tests.
Next free migration **V010** (V011 only if BE-053 runs).
