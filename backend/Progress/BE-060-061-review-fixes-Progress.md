# v4.2 adversarial-review FIX PASS — backend (BE-060 seed/lookup, BE-061/063 estimate legs)

Six confirmed findings from the v4.2 backend review, all fixed in one pass. No new ticket: this is the
review fast-follow on BE-060/BE-061 (Asana comments on both). No git here — the orchestrator commits.

Gates: `./gradlew check` **336 green** (327 baseline + 9 new tests), detekt/ktlint clean.
Live eval re-run ONCE after the ladder change (≈$0.01): `LIVE EVAL food-kcal -> [235, 150, 205, 5] in 1258ms`,
repeat `46ms` with `inputTokens=0` (cache write-back intact), `workout-kcal -> 520`, "Pole dance" → an honest
empty map. Same band as the pre-fix run ([235, 150, 190, 5]); item 3 is the model's own coxinha number.

---

## C1 (CRITICAL) — the fuzzy leg answered Brazilian staples with the RAW or POWDERED row

Reported: "leite integral" → *Leite, de vaca, integral, **pó*** (497 kcal → 200 ml billed at ~995);
"feijão carioca" → **cru** (329, dry beans) instead of cozido (76); "frango grelhado" → *Frango,
**coração**, grelhado*; "pão de queijo" → **cru** dough instead of assado. All four reproduced against
the real seed before the fix.

Root cause, systemic and not four bugs: TACO names the STATE of a food, trigram similarity cannot tell
"cru" from "cozido", and the tie-break (`length(name_norm)`, then alphabetical) actively PREFERS the
shorter "cru"/"pó" name. Three levers, exactly as the review prescribed:

**(a) The FUZZY query now demotes a raw/powder row the query did not ask for** (`FoodLookup.kt`):

```sql
ORDER BY (name_norm ~ '(^| )(cru|crua|crus|cruas|po)( |$)' AND ? !~ '(^| )(cru|crua|crus|cruas|po)( |$)'),
         sim DESC, length(name_norm), name_norm
```

DEMOTE, not exclude — measured, not guessed. I loaded the real V013 into a throwaway Postgres and
diffed every query the change can touch (each seed name with its trailing `cru`/`crua`/`pó` stripped,
106 of them). Exclusion made ~30 foods whose ONLY row is the raw one — every fruit — into misses, and
promoted "Batata, inglesa, **frita**" (267) over crua (64). Demotion keeps the raw row when it is the
only one ("banana prata", "manga Palmer", "aveia flocos" all still answer) and prefers the prepared
sibling where one exists: arroz cru 358 → cozido 128, lentilha 339 → cozida 93, "carne bovina lagarto"
cru 135 → cozido 222, every feijão variety cru ~330 → cozido ~77. A query that DOES say raw
("aveia crua", "leite de vaca integral pó") is not demoted away from it.

**(b) Curated fluid-milk rows in the seed.** This TACO edition publishes no energy for fluid milk (the
cells are `*`), which is why the only milk in the table was powder — the pre-fix comment in the
generator called that an acceptable miss, but the fuzzy leg turned it into a wrong ANSWER, which the
table never re-asks. Two rows, `source='curated'`, USDA FoodData Central (public domain), per 100 ml:
*Leite, de vaca, integral, fluido* 61 (`usda:746782`) and *…desnatado, fluido* 34 (`usda:746776`).
V013's provenance header documents them alongside TACO's.

**(c) Aliases** (the sanctioned free lever, ADR-0020 d.6 — never a lower threshold): `leite`,
`leite integral`, `leite desnatado`, `milk`, `feijao carioca`, `frango grelhado`, `pao de queijo`,
and `batata inglesa` (the one demotion regression the sweep found, pinned to cozida).

`tools/gen_seed_migrations.py` emits all of it deterministically (new `CURATED` list; the hand-seed
validation now runs against the seeded ids rather than TACO's descriptions, so an alias pointing at a
row that was skipped for a missing kcal also fails the script). Re-run end-to-end: **V014 came back
byte-identical**, V013 differs only by the two curated rows + eight aliases. Seed: **592 rows / 74 aliases**.

Proof — `FoodLookupTest` (real seed, Testcontainers, no model):
`fluid milk answers as milk, not as milk powder` (200 ml → **120**, not ~995; desnatado → 70) ·
`beans answer cooked, not dry` (+ un-aliased "feijao rosinha" → cozido, the systemic half) ·
`grilled chicken is the breast, not the heart` · `pao de queijo is the baked one and counts by the unit`
(110 kcal at `grams_per_unit` 30) · `demoting raw rows never costs the foods whose only row IS the raw one`.

## M2 (MAJOR) — a flat 1024-token budget truncated any muscle batch past ~20 misses

`vita.ai.estimate-max-output-tokens: 1024` was sized from "~12 output tokens per item", which is a food
answer (`{"n":1,"kcal":283}`). A muscle answer is ~90 (six roles + wholeBody), so a 60-exercise program
came back truncated → unparseable → the whole pass empty.

The budget is now sized per request: `EstimateService.budget(answers) = (answers × 96 + 256)` clamped to
[512, 8192], passed into `ClaudeClient.callEstimateTool`, which clamps it to the config value — the yaml
knob stays, as the CEILING (raised to 8192). `max_tokens` is a cap, not a charge, so erring high is free.

Proof — `EstimateExerciseMusclesTest.the output budget covers a 60-miss batch's worst-case answer`:
builds the worst-case answer JSON (six roles + wholeBody), counts it at a conservative 3 chars/token
(≈94/item → 5640 for 60), asserts `budget(60)` (6016) and the 8192 ceiling both clear it, and then drives
a real 30-miss pass through WireMock and asserts the wire body carries `"max_tokens":3136`.

## M3 (MAJOR) — the capture prompt still listed 11 muscles

Contract 0.9.0 D6 made `traps` a twelfth silhouette. The plan and estimate TOOL SCHEMAS pick it up
automatically (both build their enum from `Muscles.VOCAB` — verified), but the capture tool's `detail` is
a deliberately bare object, so `NUTRITION_PREAMBLE` **is** the capture path's entire muscle vocabulary:
the model could not name traps at all, and "Face pull"/"Deadlift" captures lost the distinction the app
has a chip and a silhouette for.

`traps` added to the preamble list, and the committed golden regenerated as a **deliberate byte change**
(`golden/parse-text-request-v0.7.0.json`, the one line). `PlanAwareParseTest`'s KDoc now records why the
golden moved and that any OTHER diff is still a regression. Stale "11-silhouette" comments in
`PlanPrompts` and `EntryService` corrected to 12.

## M4 (MINOR) — food 422 fired when the model had simply answered nothing

`foodKcal` 422'd on "no answers at all", regardless of whether the model leg had failed. The exercise leg
and the contract both say 422 means the pass could not RUN. Now `foodKcal` tracks `legFailed` the same
way (`askFood` returns the `TypedToolCall` instead of just the usage) and 422s only on
`legFailed && nothing answered`. Two new tests: a model that succeeds and declines every line → 200 of
nulls; a pass with nothing askable in it (quantity ≤ 0, empty name) → 200 of nulls and zero model calls.
The existing 422 test (transport failure, no table hit) is unchanged and still passes.

## M5 (MINOR) — "colher" and "colheres" were two cache rows

`basisUnit` kept the typed word verbatim for units it cannot convert, so the same food asked with a
plural unit was a second miss and a second charge. It now folds `-es`/`-s` to the singular (the key only
has to be STABLE, not grammatical — and the prompt already asks for "1 <unit>"). Test:
`a plural unit and its singular share one cache row` — "2 colheres" is asked once, "1 colher" then costs
zero calls and reads the same cache row.

## M6 (MINOR) — ADR-0020 now states the empty-answer caching rule

Decision 7 gains it: a line the model returns with no muscle it was confident about is cached like any
other answer, so the exercise stays honestly unmapped until a `TRUNCATE` — re-asking a question already
answered "I don't know" pays again for the same nothing. (A line the model omits entirely is not cached
and is asked again.)

---

## Files changed

- `services/vita-api/src/main/kotlin/com/llmagal/vita/service/estimate/FoodLookup.kt` — FUZZY demotion.
- `services/vita-api/src/main/kotlin/com/llmagal/vita/service/estimate/EstimateService.kt` — `budget()`,
  sized calls, food 422 semantics, unit singular fold.
- `services/vita-api/src/main/kotlin/com/llmagal/vita/service/ai/ClaudeClient.kt` — `callEstimateTool`
  takes the budget (config = ceiling); `traps` in `NUTRITION_PREAMBLE`.
- `services/vita-api/src/main/resources/application.yaml` — `estimate-max-output-tokens` 1024 → 8192 (ceiling).
- `services/vita-api/src/main/resources/db/migration/V013__food_tables.sql` — regenerated (592 rows / 74 aliases).
- `tools/gen_seed_migrations.py` — `CURATED`, the new aliases, validation against seeded ids.
- `Doc/ADRs/ADR-0020-…md` — decision 7 clause.
- `services/vita-api/src/main/kotlin/com/llmagal/vita/service/ai/PlanPrompts.kt`,
  `…/service/entries/EntryService.kt` — 11 → 12 silhouettes in comments.
- Tests: `FoodLookupTest` (+5), `EstimateFoodKcalTest` (+3), `EstimateExerciseMusclesTest` (+1),
  `EstimateTestBase` (ceiling 8192), `PlanAwareParseTest` KDoc,
  `src/test/resources/golden/parse-text-request-v0.7.0.json`.

## For BE-064 (deploy)

V013 changed in place — legitimate, it has never been applied in prod (V013/V014 ride BE-064's image, and
the pre-prod blanket allows destructive DB changes). Nothing to migrate; the boot probe line
`seed table=food rows=592 aliases=74` is the new expected value.
