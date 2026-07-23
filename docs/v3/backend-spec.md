# Backend spec — V3 round: full plan model, async PDF parse, plan status (contract v0.7.0)

Team: **backend** (Kotlin/Spring, `backend/services/vita-api`). Spec phase 2026-07-23.
Tickets: **BE-042 … BE-046** (listed in §9 — NOT filed in Asana yet; orchestrator files after CEO review).

> **CEO V3 DECISIONS 2026-07-23 (binding, baked in below):** the v3 target data model ships
> **completely** (per-meal options, per-item substitution lists with persisted "usual",
> supplements, hydration, report totals) — real contract + parse + migration round, not
> design-only. `docs/v3/design_handoff_vita_v3/meal-plan.pdf` stays **as-is** as the canonical
> real test fixture (private repo, NOT anonymized; tests run against the real bytes).
> **Real Anthropic API tests are AUTHORIZED** (opt-in/gated) — the acceptance bar is:
> *importing THIS PDF works perfectly*. A2 stands (destructive migrations OK, no
> legacy/backfill); A1/A3 spirit stands (plan data plaintext where new, existing doc-blob
> encryption untouched).

Binding sources, in precedence order:

1. `docs/v3/design_handoff_vita_v3/README.md` — the V3 design handoff (esp. "PDF Parsing —
   target data model" + §1b swap-selection semantics).
2. `docs/v3/design_handoff_vita_v3/meal-plan.pdf` — the real 13-page source document.
   **§2 of this spec is its extracted ground truth — test assertions come from there,
   not from the handoff's example numbers.**
3. `docs/contracts/vita-api-v0.yaml` — v0.6.0 today; this round bumps to **0.7.0**
   (additive except ONE flagged breaking change, D-2).
4. `docs/meal-plan-handover/backend-spec.md` + ADR-0017 — previous round's decisions
   (D-1..D-11, A1–A9) stay in force unless amended here.

Existing code this touches: `model/ai/PlanDtos.kt`, `service/ai/{PlanPrompts,PlanParseService,ClaudeClient}.kt`,
`service/plans/{PlanService,PortionBoundsHeuristic}.kt`, `repository/plans/*`,
`controller/plans/PlanController.kt`, `controller/ai/PlanParseController.kt`,
`service/jobs/TokenCleanupJob.kt`, migrations `V001..V008` (next free: **V009**).

---

## 0 · Engineering decisions made here (not CEO questions)

| # | Decision | Why / ceiling |
|---|---|---|
| V3-D1 | **The whole v3 model lives inside the existing encrypted doc blob** (options, swaps, usuals, status, hydration, supplements, notes). Zero new columns on `eating_plan`; the only new table is the parse-job tracker (§4). | The doc is already one opaque encrypted JSON; the server never aggregates plan numbers. Shortest diff. |
| V3-D2 | **`POST /parse/eating-plan` becomes async** (202 + job poll; on success the backend SAVES the parsed plan as the current version with `status: "review"`). **This is the round's one breaking contract change.** | Physics: this PDF yields ~274 swap options ≈ 9–11k output tokens ≈ 2–4 min of Sonnet generation — cannot fit the sync path's 25 s timeout or API Gateway's hard 29 s. The v3 product flow *also* wants parse-and-persist ("imported-but-unreviewed is a persisted state" — Home banner survives app restarts). One change serves both. App updates in lockstep (pre-prod, single consumer). |
| V3-D3 | **Plan status is a doc field**, `status: ready \| review` (absent on legacy docs → read as `ready`). Lifecycle: `none` = 404 on GET /plan (unchanged) · `review` = written by the async parse-save · `ready` = written by the app's final "Finish setup" PUT /plan (or any POST /plan without status). **No status endpoint** — status rides the existing POST/PUT/GET. | Fewest endpoints that work. The app always fetches the full doc anyway. |
| V3-D4 | **Choosing a "usual" (swap or meal option) is a doc edit**: `PlanItem.usualSwapIndex` / `PlanMeal.usualOptionIndex` fields, set by the app via the existing `PUT /plan`. **No new endpoint for usuals.** Undo = PUT the previous value back (app-side toast Undo). | The doc is client-editable by design (full-doc replace since BE-019). Setup flow = app accumulates choices, one PUT at "Finish setup" (plus optional intermediate PUTs per meal — app's call). |
| V3-D5 | **Swaps carry NO nutrition estimates** — `{name, quantity?, unit?, grams?}` only, exactly the handoff model (`swaps: [{ name, qty }]`). When a swap is the usual, its macros derive app-side from **nutritionist equivalence**: a substitution at its stated quantity ≈ the original item's total. `effectivePerUnit = base.nutritionPerUnit × base.quantity / swap.quantity`. Labeled estimate like everything else. | Per-swap Claude estimates would be 3–4× the output tokens (cost + minutes) for numbers the nutritionist already equalized by construction. Ceiling: per-swap estimates later if equivalence proves too coarse. |
| V3-D6 | **`moreCount` is NOT in the contract** — the full swap list ships (max real count: 26); the app derives "+ N more" as `swaps.length − visible`. | Derivable data never goes on the wire. |
| V3-D7 | **No separate `report` object** — the nutritionist's report-page numbers land in the EXISTING fields: per-meal/option `kcal` and top-level `dailyTotals` + `micros`, with the prompt instructing *verbatim copy when the document states them* (stated numbers are transcribed, not re-estimated). | One field per fact. `report.totals` would duplicate `dailyTotals` byte for byte. |
| V3-D8 | **Item ids `it-N` now cover option items too**: flat document order = meals in order; within a meal, base `items` first, then each `options[k].items` in order. Same save-time-only rule (A2, no backfill). | Today's plan renders the chosen option's items — they need overlay keys and portion bounds like base items. |
| V3-D9 | **Portion bounds + A5 edit detection use the EFFECTIVE quantity/unit** — the usual swap's `quantity`/`unit` when `usualSwapIndex` is set, else the item's own. Changing a usual ⇒ effective qty/unit changes ⇒ that item's portion override resets and its `portion` bounds are recomputed at save (D-4/A5 extended, same rule). Effective quantity absent (an "à vontade" swap) ⇒ `portion` omitted (§3.3 applicability rule, unchanged). | The slider and the overlay are about what the user will actually eat. |
| V3-D10 | **Supplements → habits is app-side.** Habits are device-local (backend has no habit store; check-ins ride `POST /entries type=checkin` with denormalized habitId/habitName). Backend ships `supplements[]` + `hydration` in the doc; "Finish setup" habit creation is the app's. **No backend endpoint.** | Matches the existing habit architecture; zero speculative server state. |
| V3-D11 | **Parse transcribes in the document's language** (this PDF is pt-BR → names/notes come back pt-BR). No translation layer. | The plan is the user's document; Vita records what it says. |
| V3-D12 | **Async job = own table + `@Async` in-process execution**, NOT the generic `job` queue. No input and no result stored in the job row — the result IS the saved plan; the row only tracks state. Instance dies mid-parse → row goes stale → reported `failed` after 10 min (user retries the import). | The generic queue's 60 s poll + payload persistence would force encrypting plan text into job rows for zero benefit. Ceiling: move onto the queue if we ever need durable retries. `// ponytail:` comment goes on the worker. |
| V3-D13 | **Separate token/timeout knobs for the async path** (`plan-async-max-output-tokens: 16384`, `plan-async-timeout-seconds: 300`). Sync paths (photo, text/PDF program parse) keep `plan-max-output-tokens: 3072` / 25 s — there the cap doubles as a latency guard inside API GW's 29 s. 16384 < the ~21k non-streaming Messages-API ceiling, no streaming needed. | Different latency envelopes, different knobs. Only produced tokens are billed. |
| V3-D14 | **Training-program parse stays sync and unchanged** this round — the v3 design has no `review` state for programs (`trainSt: 'ready' \| 'none'`), and coach PDFs haven't hit the size wall. | YAGNI; revisit when a real program PDF blows the 25 s budget. |
| V3-D15 | 18b review fold-in: **`PUT /plan/portions` with a JSON `null` value** (`{"it-1": null}`) currently NPEs → 500. Controller binds `Map<String, Double?>` and rejects null values with **400** (contract already says 400 for bad values). | One-line trust-boundary guard; rides BE-043. |

---

## 1 · Contract v0.7.0 — exact diff

File: `docs/contracts/vita-api-v0.yaml`. `info.version: 0.6.0 → 0.7.0`. Append to `info.description`:

```
0.7.0 (V3 plan round): the full v3 plan model — PlanMeal gains
kcal/note/options/usualOptionIndex, PlanItem gains grams/swaps/usualSwapIndex,
EatingPlanDraft gains status/hydration/supplements/note. ONE BREAKING CHANGE:
POST /parse/eating-plan is now asynchronous (202 + job id; on success the
parsed plan is SAVED as the current version with status "review") — poll
GET /parse/eating-plan/jobs/{jobId}, then GET /plan. Everything else is
additive; /parse/training-program is unchanged (sync).
```

### 1.1 `EatingPlanDraft` — four new optional properties

```yaml
        status:
          type: string
          enum: [ready, review]
          description: >-
            Plan lifecycle (v3): "review" = imported but not yet reviewed (the
            async parse saves with this; drives the Home "finish setup" banner
            and Today's-plan review state); "ready" = reviewed/active. Absent
            (docs saved before 0.7.0) reads as "ready". "none" is not a value —
            it is GET /plan returning 404. The app flips review→ready by
            PUTting the doc with status "ready" ("Finish setup").
        note:
          type: string
          maxLength: 1000
          description: >-
            Plan-level nutritionist guidance transcribed from the document
            (e.g. "up to 2 meals a week may go off-plan; plan valid for up to
            6 months"). Display-only, in the document's own language.
        hydration:
          $ref: "#/components/schemas/Hydration"
        supplements:
          type: array
          maxItems: 20
          items: { $ref: "#/components/schemas/Supplement" }
```

And amend the existing `dailyTotals` description (verbatim-copy semantics, D-7):

```yaml
        dailyTotals:
          allOf: [ { $ref: "#/components/schemas/MacroTotals" } ]
          description: >-
            Daily totals. When the document contains a nutrient report page
            (e.g. "Relatório de nutrientes"), these are its STATED totals
            copied verbatim (transcription, not estimation); otherwise a model
            estimate. Same rule applies to per-meal/option kcal and `micros`.
```

### 1.2 New component schemas

```yaml
    Hydration:
      type: object
      required: [mlPerDay]
      properties:
        mlPerDay:
          type: number
          minimum: 0
          description: Daily water target stated by the plan (e.g. 2500).
        note:
          type: string
          maxLength: 500
          description: How the plan says to spread it, transcribed.

    Supplement:
      type: object
      required: [name]
      description: >-
        A supplement prescription transcribed from the plan ("SUPLEMENTAÇÃO").
        Water is hydration, never a supplement. All fields are transcription
        in the document's language; the app turns accepted ones into local
        habits on "Finish setup" (device-side — the backend stores no habits).
      properties:
        name: { type: string, maxLength: 100 }
        dose:
          type: string
          maxLength: 100
          description: As stated, e.g. "1 dose (4g)", "1 cápsula 1g".
        timing:
          type: string
          maxLength: 200
          description: As stated, e.g. "ao dia, junto ao almoço ou jantar".
        duration:
          type: string
          maxLength: 100
          description: As stated, e.g. "5 meses". Absent when open-ended.

    MealOption:
      type: object
      required: [name, items]
      description: >-
        An alternative complete composition for a meal ("Opção 2 – Brunch").
        The meal's own `items` are the default composition; each option
        replaces them wholesale when chosen. Option items are full PlanItems:
        they get server ids, portion bounds and swap lists like base items.
      properties:
        name: { type: string, maxLength: 100 }
        kcal:
          type: number
          minimum: 0
          description: Stated per-option kcal from the report page when present, else estimate.
        items:
          type: array
          minItems: 1
          items: { $ref: "#/components/schemas/PlanItem" }

    SwapOption:
      type: object
      required: [name]
      description: >-
        One entry of an item's substitution list ("Opções de substituição
        para …"), transcribed with its stated quantity. Swaps carry NO
        nutrition: a substitution at its stated quantity is treated as
        equivalent to the original item's total (that is what a nutritionist
        substitution list means) — the app derives a chosen swap's per-unit
        macros as base.nutritionPerUnit × base.quantity / swap.quantity,
        labeled an estimate. "À vontade" (as much as you like) entries have
        no quantity and unit "à vontade"; portion adjust is unavailable for
        them (no bounds).
      properties:
        name: { type: string, maxLength: 150 }
        quantity: { type: number }
        unit:
          type: string
          maxLength: 40
          description: Free-form, display verbatim ("Fatia(s) média(s)", "à vontade").
        grams:
          type: number
          minimum: 0
          description: Gram/ml equivalent when stated in parentheses ("2 Fatias (150g)" → 150).
```

### 1.3 `PlanMeal` — four new optional properties

```yaml
        kcal:
          type: number
          minimum: 0
          description: >-
            Per-meal kcal for the DEFAULT composition — stated report-page
            value when present ("Almoço … 702 Kcal"), else estimate.
        note:
          type: string
          maxLength: 1000
          description: The meal's "Observações", transcribed.
        options:
          type: array
          maxItems: 8
          items: { $ref: "#/components/schemas/MealOption" }
        usualOptionIndex:
          type: integer
          minimum: 0
          description: >-
            The user's usual composition: absent/null = the meal's own
            `items`; k = options[k]. Set by the app via PUT /plan (plan
            setup / "pick your usual"). Out of range on PUT → 400.
```

### 1.4 `PlanItem` — three new optional properties

```yaml
        grams:
          type: number
          minimum: 0
          description: >-
            Gram/ml equivalent when the plan states a count plus grams
            ("1 unidade (100g)" → quantity 1, unit "unidade", grams 100).
            Display + swap-equivalence aid; portion bounds still derive from
            quantity/unit.
        swaps:
          type: array
          maxItems: 40
          items: { $ref: "#/components/schemas/SwapOption" }
          description: >-
            The item's full substitution list in document order (this real
            plan runs up to 26 per item). The app shows a few + "+ N more"
            (N derived — no moreCount field) and the searchable sheet.
        usualSwapIndex:
          type: integer
          minimum: 0
          description: >-
            The user's usual for this item: absent/null = the original item;
            k = swaps[k] (its name/quantity shown in place, "SWAPPED" badge,
            first row of the open list becomes the ORIGINAL restore row). Set
            via PUT /plan. Persisted into the plan — NOT a one-day change
            (one-day changes remain the portions overlay). Changing it resets
            the item's portion override and recomputes `portion` from the
            swap's quantity/unit at save. Out of range on PUT → 400.
```

Also amend `PortionBounds` description: bounds derive from the **effective** quantity/unit
(the usual swap's when one is chosen). And `PortionsMap`: overrides are in the **effective**
unit; an item whose usual changed gets its override reset (A5, V3-D9).

### 1.5 `POST /parse/eating-plan` — BREAKING: now async

Replace the 200 response; description rewritten:

```yaml
  /parse/eating-plan:
    post:
      tags: [parse]
      summary: Start an eating-plan import (async parse; saves as status "review")
      description: |
        v3 (0.7.0, BREAKING vs 0.6.0): a full plan parse (options + complete
        substitution lists) takes minutes — far beyond the API Gateway 29 s
        ceiling — so this endpoint now ACCEPTS the import and parses in the
        background. On success the parsed plan is SAVED as the user's current
        eating-plan version with status "review" (new version: overlay resets,
        ids assigned — the imported-but-unreviewed state is persistent, per
        the v3 design). Poll GET /parse/eating-plan/jobs/{jobId}; when state
        is "done", GET /plan. Body unchanged (exactly one of text | fileRef).
        Nothing about the uploaded PDF is persisted beyond the parse
        (ADR-0005); only the structured result is saved.
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/PlanImportRequest" }
      responses:
        "202":
          description: Import accepted; parse running.
          content:
            application/json:
              schema:
                type: object
                required: [jobId]
                properties:
                  jobId: { type: string, format: uuid }
        "400":
          description: Not exactly one of text/fileRef, or text over 8000 chars.
          content:
            application/problem+json:
              schema: { $ref: "#/components/schemas/Problem" }
        "401": { $ref: "#/components/responses/Unauthorized" }
        "409":
          description: An import is already running for this user (detail carries its jobId).
          content:
            application/problem+json:
              schema: { $ref: "#/components/schemas/Problem" }
        "429": { $ref: "#/components/responses/TooManyRequests" }
        default: { $ref: "#/components/responses/Problem" }
```

### 1.6 New path `GET /parse/eating-plan/jobs/{jobId}`

```yaml
  /parse/eating-plan/jobs/{jobId}:
    get:
      tags: [parse]
      summary: Poll an eating-plan import job
      description: |
        States: "running" → keep polling (suggested every 2–3 s; a job older
        than 10 minutes is reported failed); "done" → the plan was saved with
        status "review", fetch GET /plan; "failed" → failureReason is a short
        human-safe sentence (unreadable document, not an eating plan, upstream
        error) — the app offers retry / manual entry. Jobs are visible to
        their owner only (404 otherwise) and are swept after 7 days.
      parameters:
        - name: jobId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: Job state.
          content:
            application/json:
              schema:
                type: object
                required: [state]
                properties:
                  state: { type: string, enum: [running, done, failed] }
                  failureReason: { type: string }
        "401": { $ref: "#/components/responses/Unauthorized" }
        "404": { $ref: "#/components/responses/Problem" }
        default: { $ref: "#/components/responses/Problem" }
```

`/parse/training-program`, `/uploads`, `/plan*`, `/program*` paths: **unchanged** (plan
schemas above flow through them automatically). redocly must exit 0.

---

## 2 · Ground truth of `meal-plan.pdf` (extracted 2026-07-23 — the fixture truth table)

Extracted from the real bytes (pypdf). **Test assertions come from THIS table.** The handoff
README's "6 meals · 214 swap options" and "up to 25" are prototype copy — the real numbers
differ slightly (26 max, 274 total) and the fixtures follow the PDF.

**Meals (document order) — 5 meals, 42 items total (17 base + 25 in options):**

| Meal | Base items (qty) | Swaps per item |
|---|---|---|
| Pré-treino | Banana 1 unidade (100g) | 25 |
| Pós-treino | Whey protein concentrado 1 medidor (30g) | 0 (note points at an annex list) |
| Almoço | Milho verde 200g · Frango desfiado 200g · Azeite de oliva 1 colher chá (2g) · Folhoso cru/refogado 2 pegadores (30g) · Legumes cozido/cru (75g) · Legume refogado/cozido (150g) · Queijo Branco 35g | 19 · 5 · 0 · 11 · 7 · 16 · 11 |
| Lanche | Maçã verde 1 unidade (150g) | **26** (Banana + the 25-fruit list) |
| Jantar | same 7 items as Almoço | same lists (19·5·0·11·7·16·11) |

**Meal options:**

| Option | Items | Swaps |
|---|---|---|
| Almoço · Opção 2 – Brunch | 6 (Pão integral 70g, Cottage 80g, Ovo 4 un (220g), Queijo Jong Belegen 35g, Rúcula 25g, Legume variados 100g) | 0 · 8 · 1 · 6 · 11 · 7 = 33 |
| Jantar · Opção 2 – Tortilha | 5 (Tortilha 2 un (84g), Queijo 70g, Cottage 50g, Ovo 3 un (165g), Rúcula 24g) | 0 · 7 · 7 · 8 · 11 = 33 |
| Jantar · Opção 3 – Macarrão sem milho | 7 (Macarrão 170g, Frango 200g, Azeite 2g, Folhoso 30g, Legumes 75g, Legume refogado 150g, Azeite-preparo 8g) | 3 · 5 · 0 · 0 · 0 · 0 · 3 = 11 |
| Jantar · Opção 4 – Hamburguer | 7 (Pão 60g, Maionese 17g, Ovo 2 un (110g), Peito de frango moído 170g, Queijo 30g, Alface 20g, Tomate 45g) | 0 · 2 · 0 · 3 · 3 · 0 · 0 = 8 |

**Total swap options: 274** (25 + 69 + 33 + 26 + 69 + 33 + 11 + 8).
"À vontade" entries exist (Alface, Rúcula crua, Repolho — no quantity).
The PDF states **no meal times** (the design's 06:40/13:00/… were demo data — `time` stays absent).

**Hydration (p9, repeated p11):** Água **2500 ml**/day, split into 4–5 portions between meals.

**Supplements (p10) — exactly 3 (water is hydration, NOT a supplement — verified):**
1. Creatina Monohidratada — 1 dose (**4g**), daily; away from caffeine; **7×/week for 5 months**.
2. Ômega-3 (330mg EPA / 220mg DHA) — 1 cápsula 1g, daily, with lunch or dinner.
3. Vitamina D (Colecalciferol) — 1 cápsula/dose 10 µg, daily, with lunch or dinner; **5 months**.

**Report page (p12) — stated numbers (transcription targets, not estimates):**

| Meal / option | P (g) | F (g) | C (g) | kcal |
|---|---|---|---|---|
| Pré-treino | 1.3 | 0.2 | 26.7 | **109** |
| Pós-treino | 21.0 | 2.3 | 4.0 | **121** |
| Almoço | 83.0 | 22.2 | 51.6 | **702** |
| Almoço Opção 2 – Brunch | 59.1 | 33.1 | 37.4 | **679** |
| Lanche | 0.5 | 0.0 | 19.5 | **72** |
| Jantar | 83.0 | 22.2 | 51.6 | **702** |
| Jantar Opção 2 – Tortilha | 57.4 | 34.2 | 45.7 | **718** |
| Jantar Opção 3 – Macarrão | 75.6 | 20.2 | 61.0 | **706** |
| Jantar Opção 4 – Hamburguer | 65.1 | 29.8 | 39.8 | **691** |
| Suplementação | 0.0 | 1.0 | 0.0 | 9 |
| **Totals** | **188.6** | **47.9** | **153.4** | **1716** |

Micros stated (→ daily `micros` array): Fibras 37.1 g · Cálcio 679.7 mg · Ferro 8.1 mg ·
Sódio 1845.5 mg (plus the full vitamin table — model transcribes what it can).

Plan-level notes (p11): plan valid up to 6 months; up to **2 off-plan meals/week** built in
(→ `note`, and the design's "FROM YOUR NUTRITIONIST" line).

---

## 3 · Save semantics (`PlanService`) — deltas over v0.6.0

### 3.1 `decorate()` — ids + bounds now cover options and usuals (V3-D8/D9)

- Flat id order: for each meal — base `items`, then `options[0].items`, `options[1].items`, …
  Fresh `it-1…it-N` on POST; PUT keeps valid round-tripped ids and assigns `it-{max+1}…` to
  the rest (existing rules, now applied over the wider traversal). This PDF → `it-1…it-42`.
- **Effective quantity/unit** of an item = `swaps[usualSwapIndex].{quantity,unit}` when
  `usualSwapIndex` is set, else the item's own. `portion` = `PortionBoundsHeuristic.of(effectiveQty,
  effectiveUnit)` — heuristic itself unchanged. Effective qty null/≤0 for g/ml or an
  "à vontade" swap → `portion` omitted (existing applicability rule).
- Validation on POST/PUT (400): `usualSwapIndex` within `swaps` range; `usualOptionIndex`
  within `options` range; `swaps.size ≤ 40`; `options.size ≤ 8`; `status` ∈ {ready, review}
  when present.

### 3.2 A5 overlay rules extended (V3-D9)

`pruneOverlayAfterEdit` compares **effective** (quantity, unit) instead of raw: untouched item
(same effective pair) keeps its override; changed effective pair (a qty/unit edit OR a
usual-swap change, either direction) → override reset; removed id → pruned. `itemBounds` for
`putPortions` reads the stored `portion` field as today — no change needed there (bounds were
already recomputed at save).

### 3.3 Status handling (V3-D3)

Nothing server-side interprets status; it is doc content, validated as an enum. The async
parse-save (§4) stamps `status = "review"` into the draft before `importPlan`. `POST /plan`
bodies without status get `"ready"` stamped (DTO default) so new docs are always explicit.
Legacy docs read back without the key; the contract documents absent = ready.

### 3.4 Fold-in fix (V3-D15)

`PlanController.putPortions` binds `@RequestBody body: Map<String, Double?>` and rejects any
null value with 400 ("Portion value for <id> must be a number") before calling the service.
Regression test: `{"it-1": null}` → 400 problem+json (was NPE → 500).

### 3.5 DTO deltas (`model/ai/PlanDtos.kt`)

`EatingPlanDraft` + `status: String = "ready"`, `note: String? = null`,
`hydration: Hydration? = null`, `supplements: List<Supplement>? = null`.
`PlanMeal` + `kcal: Double? = null`, `note: String? = null`,
`options: List<MealOption>? = null`, `usualOptionIndex: Int? = null`.
`PlanItem` + `grams: Double? = null`, `swaps: List<SwapOption>? = null`,
`usualSwapIndex: Int? = null`.
New: `MealOption(name, kcal? , items)`, `SwapOption(name, quantity?, unit?, grams?)`,
`Hydration(mlPerDay, note?)`, `Supplement(name, dose?, timing?, duration?)`.
All `@JsonInclude(NON_NULL)` like siblings.

---

## 4 · Async parse job (V3-D2/D12)

### 4.1 Migration `V009__plan_parse_job.sql` (expand-only)

```sql
-- V009 — async eating-plan import tracker (V3 round). State only: the job's
-- input lives in memory for the one in-process run (text/PDF bytes are never
-- persisted, ADR-0005) and its result IS the saved eating_plan row (status
-- "review" inside the encrypted doc). No PII: failure holds a fixed server
-- phrase, never document content. Swept after 7 days (TokenCleanupJob).
CREATE TABLE plan_parse_job (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    state      text NOT NULL CHECK (state IN ('running', 'done', 'failed')),
    failure    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_parse_job_user_idx ON plan_parse_job (user_id, created_at DESC);
```

### 4.2 Flow

1. `POST /parse/eating-plan`: existing shape checks (exactly one of text/fileRef → 400;
   text ≤ 8000 → 400) and `ParseQuota` (429, counted at accept — a failed parse still spent
   tokens). If the user has a `running` job younger than the stale window → **409** with the
   jobId in `detail`. Else insert `running` row, hand off to the executor, return **202 {jobId}**.
2. Worker (`service/ai/PlanImportWorker.kt`, a `@Async("planParseExecutor")` method; executor =
   fixed pool of 2 — caps concurrent Claude spend): resolve content (`fileStore.read` —
   `UnknownFileRefException` → `failed`, "The uploaded file is unknown or expired.");
   `ClaudeClient.callTool` on the async knobs (§5.3); unusable/empty output → `failed`,
   "The document could not be read as an eating plan."; usable draft → sanitize + decorate
   (existing `decoratePlan`), stamp `status="review"`, `PlanService.importPlan` (new version,
   ids assigned, overlay reset) → `done`. Any other throw → `failed` with a generic phrase,
   WARN log with the real cause. The parse INFO cost line (BE-039) fires exactly as today.
   `// ponytail: in-process @Async, no durable retry — instance death → stale→failed, user re-imports.`
3. `GET /parse/eating-plan/jobs/{id}`: owner's row or 404. `running` older than
   `vita.ai.plan-job-stale-minutes` (default 10) → mark + report `failed`
   ("The import timed out — try again.").
4. Sweep: one added DELETE in `TokenCleanupJob` — `plan_parse_job` rows older than 7 days.

No app-visible progress percentages (one atomic Claude call). The parsing-screen "findings"
lines are app-computed after `done` from the fetched plan (+ page count known client-side).

---

## 5 · Parse extensions (`PlanPrompts` / `ClaudeClient`)

### 5.1 Tool schema (`record_eating_plan`) — additive properties

Top level: `status` is NOT in the tool (server concern). Add `note` (string), `hydration`
`{mlPerDay: number, note: string}` (required: mlPerDay), `supplements` array
`{name (req), dose, timing, duration}`. Meal properties: `kcal` (number), `note` (string),
`options` array `{name (req), kcal, items (req, same item schema)}`. Item properties: `grams`
(number), `swaps` array `{name (req), quantity (number), unit (string), grams (number)}`.
Items schema is defined once as a `val` and referenced by both `meals[].items` and
`options[].items` (identical shape — swaps included in both).

### 5.2 `EATING_PLAN_SYSTEM` prompt — appended block (keep the existing framing + per-unit block untouched)

```
Transcribe in the document's own language — never translate names, notes,
doses or units.

A meal may define alternative complete compositions ("Opção 2 – Brunch",
"Opção 3 – …"): put the first/default composition in the meal's items and
each alternative in options with its own name, kcal and full items. Never
merge options into one item list.

Each item may have a substitution list ("Opções de substituição para …"):
record EVERY entry as a swap with its name and stated quantity — lists can
have 25+ entries and every one matters; never skip, merge or summarize.
When a quantity is a count plus grams ("2 Fatia(s) média(s) (150g)"), set
quantity to the count, unit to the measure words, and grams to the grams.
"À vontade" → omit quantity, set unit to "à vontade". Swaps carry no
nutrition fields.

When the document has a nutrient report page, copy its STATED numbers
verbatim: per-meal and per-option kcal onto each meal/option, the totals
into dailyTotals, minerals/vitamins into micros. Stated numbers are
transcription, not estimation — do not recompute or round them.

Record daily water ("HIDRATAÇÃO") as hydration.mlPerDay with its note.
Record "SUPLEMENTAÇÃO" entries as supplements with dose, timing and
duration as stated. Water is hydration, never a supplement. Put per-meal
"Observações" in the meal's note and plan-level guidance (validity,
off-plan allowance) in the top-level note, both shortened sensibly.
```

### 5.3 Knobs (`application.yaml` + `ClaudeClient`)

```yaml
    plan-async-max-output-tokens: 16384   # full v3 model of a real plan ≈ 9–11k tokens; < 21k non-streaming ceiling
    plan-async-timeout-seconds: 300       # backend→Anthropic direct; no API GW in this path
```

`ClaudeClient` gains a third RestClient (or a timeout param) + a `callTool` overload taking
`maxTokens` — the async eating-plan path uses the new knobs; photo + sync program parse stay
on `plan-max-output-tokens: 3072` / 25 s (V3-D13). Retry stays MAX_ATTEMPTS=2 (worst case one
extra call). **Cost per real import (this PDF): ≈ $0.25–0.35** (≈ 25–40k input + 9–11k output
on `claude-sonnet-4-6` at $3/$15 per MTok); the existing per-parse INFO line
(`parse plan=eating outcome=… inputTokens=… outputTokens=…`) keeps it visible in CloudWatch.

---

## 6 · Test plan

### 6.1 Real-Anthropic-API test (CEO-authorized) — `PlanParseV3LiveEvalTest`

Gating = the existing BE-039 pattern, unchanged: `@Tag("live")`, excluded from `check`,
run via `ANTHROPIC_API_KEY=… ./gradlew liveEval` (key from env; `secrets.yaml` stays for
bootRun only; never logged). **Fixture = the real committed bytes**, resolved from the repo:
`docs/v3/design_handoff_vita_v3/meal-plan.pdf` (path walked up from the module dir; CEO: not
anonymized, private repo). The test builds `PlanParseService` directly (stub FileStore
returning the PDF bytes) on the async knobs — the exact production prompt/model/schema path —
and asserts against §2. It also prints the usage line. **Cost ≈ $0.30/run, on-demand only**
(never in `check`/CI); expect 2–4 min wall time.

**EXACT asserts (structure + stated numbers — these define "works perfectly"):**

| Assert | Expected |
|---|---|
| meals.size, order (name contains, accent/case-insensitive) | 5: pré-treino, pós-treino, almoço, lanche, jantar |
| Almoço options | exactly 1, name contains "Brunch", 6 items |
| Jantar options | exactly 3, in order Tortilha (5 items), Macarrão (6–7 items — the duplicated Azeite row may merge), Hamburguer (7 items) |
| Base item counts | Pré 1 · Pós 1 · Almoço 7 · Lanche 1 · Jantar 7 |
| Swap counts (named lists) | Banana 25 · Maçã verde 26 · Milho verde (Almoço) 19 · Frango (Almoço) 5 · Folhoso (Almoço) 11 |
| Total swaps across doc | ∈ [265, 280] (274 expected; small merge slack) |
| Swap fidelity spot checks | Banana list contains "Abacaxi" (quantity 2, grams 150) and a name containing "açaí" (grams 100); Milho list contains "Arroz branco cozido" (grams or quantity 150); Folhoso list contains an "à vontade" entry with quantity == null |
| hydration.mlPerDay | 2500 |
| supplements | exactly 3; names ~ creatina / ômega / vitamina D; creatine dose contains "4"; vitamin D duration contains "5"; no name ~ água/water |
| dailyTotals (stated) | kcal 1716 ±1 · proteinG 188.6 ±0.5 · carbsG 153.4 ±0.5 · fatG 47.9 ±0.5 |
| Per-meal/option kcal (stated) | 109 · 121 · 702 · 679 · 72 · 702 · 718 · 706 · 691, each ±1 |
| micros | contains fiber ≈ 37.1 ±0.5 and sodium ≈ 1845.5 ±1 (unit-normalized) |
| Pré-treino note | non-null (the wake-up water note) |

**TOLERANT asserts (model estimates — sanity, not truth):**

- Every base item has `nutritionPerUnit.kcal ≥ 0`; per-unit trap: Frango desfiado 200 g →
  `perUnit.kcal ∈ [1.0, 2.5]` (not ~165).
- Internal consistency: Σ(perUnit.kcal × quantity) over Almoço base items within ±20% of 702.
- Deterministic post-parse decoration: Frango 200 g → portion `0..400 step 10`;
  Banana (1 unidade) → `0..3 step 1`.

If an exact structural assert proves flaky across runs, the builder documents the observed
failure mode and tightens the PROMPT first (that's the point of the test); loosening a
tolerance needs a ledger note. One test method per assert group so a failure names itself.

### 6.2 Golden capture → deterministic fixtures (everything downstream of the parse)

The builder runs the live test once with a dump flag (env `VITA_EVAL_DUMP=1` writes the raw
tool-input JSON) and commits it as `src/test/resources/eval/v3-meal-plan-golden.json`
(**data derived from the real PDF — CEO cleared the PDF itself for the repo, so its
derivative is fine**). Powers, all inside `./gradlew check` (WireMock / direct, no network):

- **PlanParseEvalTest new case `v3-real-pdf-plan`**: golden deserializes into the v3 DTOs;
  the §2 structural table holds on the golden (counts computed from the fixture, A4-style);
  swaps carry no nutrition keys; decoration adds bounds.
- **PlanFlowTest extensions**: POST the golden draft → ids `it-1…it-42` flat across
  base+option items; GET echoes status/options/swaps/usuals verbatim; v0.6.0-shaped body
  (no new fields) still saves and reads (compat).
- **Usual semantics (new `PlanUsualsFlowTest` or PlanFlowTest section)**: PUT setting
  `usualSwapIndex` on Banana → saved `portion` recomputed from the swap's qty/unit; that
  item's overlay key reset, untouched items' overrides kept (V3-D9); PUT setting it back →
  original bounds return; out-of-range usual indexes → 400; `{"it-1": null}` portions PUT →
  400 (V3-D15 regression).
- **Async flow (`PlanImportFlowTest`, Testcontainers)**: POST /parse/eating-plan (WireMock
  Claude, golden response) → 202; poll → done; GET /plan has `status="review"` + ids +
  overlay reset; second POST while running → 409; WireMock 500×2 → failed + reason;
  unknown fileRef → failed; stale-running row → reported failed; job rows swept by the
  cleanup test.
- **Status**: POST /plan without status → stored "ready"; invalid status → 400; PUT
  flipping review→ready works; pre-0.7.0 stored doc (inserted raw) reads back without
  status key.
- Existing suites (202 tests) stay green; old goldens unaffected (tool additions are
  optional properties).

---

## 7 · Devops handshake

**No new AWS resources, no SSM, no new env vars.** V009 rides Flyway on the next image.
The only infra-adjacent change: parse calls from ECS now run up to ~5 min — outbound only,
no LB/API GW timeout involvement (the client polls). Deploy = the OPS-024 pattern now that
Terraform is reconciled: BE-046 builds+pushes the image and hands tag/digest; **devops runs
`terraform apply -var app_image_tag=<tag>`** (vita:9) — no CLI task-def clones. Orchestrator:
file the small devops apply ticket when the round is approved.

---

## 8 · Ticket map (dependency order — NOT yet in Asana)

| Ticket | Title | Model | Depends on |
|---|---|---|---|
| BE-042 | Contract v0.7.0 (v3 plan model + async parse) + ADR-0018 | Sonnet (mechanical, this spec §1 is the diff) | — |
| BE-043 | v3 doc model + save semantics: DTOs, ids over options, effective-qty bounds, A5-extended overlay, status, validations, portions null-guard fix | Opus | BE-042 |
| BE-044 | Async import: V009, plan_parse_job repo, @Async worker + parse-save-as-review, 202/409/poll/stale/sweep | Opus | BE-043 |
| BE-045 | v3 parse: tool schema + prompt deltas, async knobs, live real-PDF eval (§6.1), golden capture + deterministic fixtures (§6.2) | Opus | BE-043 (∥ BE-044 except the async flow test) |
| BE-046 | Ship: image build+push, live prod probes (upload real PDF → 202 → poll → GET /plan review, portions round-trip), tag to devops Terraform apply | Sonnet | BE-042..045 + devops apply |

Acceptance for the round (CEO bar): `./gradlew check` green (all §6.2 suites), **live eval
§6.1 fully green against the real API**, and the prod probe imports this exact PDF end to end.

---

## 9 · Questions for the CEO (each with the default we build unless overruled)

1. **Async import is a breaking change** to `POST /parse/eating-plan` (202 + poll instead of
   a 200 draft) — forced by physics (a full parse runs 2–4 min vs API Gateway's 29 s) and it
   implements the v3 "imported-but-unreviewed persists" state directly. App updates in
   lockstep. **Default: ship it.**
2. **`moreCount` dropped from the wire** — the full swap list ships (max 26 real entries);
   the app derives "+ N more". **Default: drop.**
3. **Swaps carry no nutrition** — a chosen usual's macros derive from nutritionist
   equivalence (swap at stated qty ≈ original item's total), labeled estimate. The
   alternative (per-swap Claude estimates) is 3–4× the output cost and minutes slower per
   import. **Default: equivalence.**
4. **No separate `report` object** — the report page's stated numbers land verbatim in the
   existing `dailyTotals`, per-meal/option `kcal`, and `micros`. Same numbers, no duplicate
   field. **Default: fold in.**
5. **Parse transcribes in the document's language** (this plan → pt-BR item names/notes in
   the app). **Default: transcribe, no translation.**
6. **Supplements→habits stays app-side** (habits are device-local; backend ships
   `supplements[]` + `hydration` only, no habit endpoint). **Default: app-side.**
7. **Meal times**: the PDF states none, so `time` stays absent and Today's plan shows meals
   without times (the design's 06:40/13:00 were demo data). **Default: absent — the app may
   later let the user set times locally.**

---

## App-team relay notes (orchestrator: forward with the contract)

- Import flow is now: POST /uploads → PUT bytes → POST /parse/eating-plan → poll
  `/parse/eating-plan/jobs/{id}` (2–3 s cadence, minutes-long) → GET /plan (`status:"review"`).
  The parsing-screen findings lines are app-computed after done (page count is known
  client-side from the picked file).
- "Pick your usual" chips = `usualOptionIndex`; per-item swap usual = `usualSwapIndex`; both
  persist via PUT /plan (full doc, round-trip ids). Undo = PUT the previous value.
  "Finish setup" = the same PUT with `status:"ready"`; then create local habits from
  `supplements` + `hydration`.
- Swapped-item macros: `base.nutritionPerUnit × base.quantity / swap.quantity` (estimate);
  "à vontade" usuals have no portion slider (no bounds by design).
- Changing a usual resets that item's portion override server-side (A5) — refetch GET /plan
  after the PUT to resync overlay + bounds.
