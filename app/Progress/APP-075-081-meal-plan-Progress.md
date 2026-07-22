# APP-075..081 — Meal Plan & Workout Plan fidelity (v0.6.0)

Asana (Vita frontend `1216519867368576`):
APP-075 `1216780941484321` · APP-076 `1216780758083108` · APP-077 `1216780941466263` ·
APP-078 `1216780941360390` · APP-079 `1216781004494493` · APP-080 `1216780758004082` ·
APP-081 `1216780754495068`. Spec: `docs/meal-plan-handover/app-spec.md` (authoritative).

## 2026-07-22 — session 18: spec + tickets filed (no code)
Build-ready spec written from the CEO-approved `DESIGN-SPEC.md`; 7 tickets filed in Backlog,
dependency-ordered. Gated on CEO ticket review.

## 2026-07-22 — session 18b: CEO amendments baked in (no code)
CEO amendments A1–A9 (binding) folded into `app-spec.md` + all 7 ticket descriptions
(`=== CEO AMENDMENTS 2026-07-22 ===` blocks; blocks override older ticket text). §11 CEO
questions now EMPTY — all answered inline. Deltas:
- **A2 — old-doc portion fallback DELETED (APP-079 shrinks ~1/3):** ids assigned at
  save/parse time only, no on-read backfill (BE-037 dropped); legacy rows may be invalidated.
  View-mode tap on an id-less item = guarded no-op (guard in APP-078's row onPress); mock
  `createPlan` assigns ids like the server; `mockParsePlan` ids follow the merged contract.
  APP-079 renamed accordingly.
- **A5 — edit touches only the edited item (APP-076 grows slightly):** new pure
  `pruneOverlayAfterEdit(oldDoc, newDoc, portions)` applied by `updatePlan` — removed item →
  override pruned; quantity/unit-changed item → override reset; all others survive. New test.
- **A4 — handoff §1.2 table = example data:** golden TEST fixture only; every assert computed
  from the in-test fixture; no 1,756.2 / ~1,880 literal anywhere in product code or asserts.
- **A6/A7 confirmed:** numeric exact field stays (portion modal); Edit button/mode stays
  (Eating Plan screen).
- **A8/A9 approved:** iOS history = captures only this round; deterministic muscleRoles
  opacity rule stands (calves/core deviation accepted, no override table).
- **A1/A3:** backend-side plaintext decisions — zero app-visible impact (noted FYI in
  APP-076/080).

Build order unchanged: 075 → (076 ∥ 077) → 078 → 079; 080 → 081 in parallel after 075/077.
Contract v0.6.0 lands at `docs/contracts/vita-api-v0.yaml` (backend lead, parallel) before
APP-075 starts.

## 2026-07-22 — session 18c: BUILD ROUND (attempt-2, all 7 tickets shipped)
Attempt-1 partial code was reverted before this round — built fresh from the amended
`app-spec.md`. All gates green (verified by builder): **tsc 0 · jest 250/250 (47 suites,
+9 new) · api:check clean · expo export OK**. Did NOT build the APK (deploy round).

- **APP-075** — regenerated `types.gen.ts` (v0.6.0). `client.ts`: +MicrosPerUnit/PortionBounds/
  PortionsMap/EatingPlanWithPortions, `getPlan()`→EatingPlanWithPortions, +`putPlanPortions()`.
  `mock.ts`: seeded handoff §1.2 11-item plan (EXAMPLE data, A4) with ids/micros/bounds +
  `storedPortions`; `createPlan` assigns ids (A2) + resets overlay; `putPlanPortions` 422s on
  unknown id; leg-day workout gains per-exercise `muscleRoles`.
- **APP-077** — `compute.ts`: qtyOf, itemTotals(+qty), meal/planDailyTotals(portions),
  planMicroTotals (all-or-null), barPct (10% headroom), qtyLabel, kcalLabel, boundsOf,
  pruneOverlayAfterEdit (A5). `tokens.ts`: `tint()` sRGB color-mix. 13 golden-fixture tests.
- **APP-076** — `db/plan.ts`: getPortions/setPortion (sparse delete-on-default, +logChanged)/
  clearPortions/enqueuePortionsPush (1 coalesced row) + updatePlan applies A5 prune + syncPlan
  overlay-dirty rules + savePlan adopts server doc (ids) & clears overlay + plan.meta helpers.
  `db/outbox.ts`: 'portions' drain reads map FRESH; poison 403/404/422/400/409 (422→resync).
  Lazy require breaks plan↔outbox cycle. 8 tests.
- **APP-078/079** — `plan.tsx` rewrite: 44px extraLight kcal (kcalLabel ~), headroom bars,
  live micros chips (static fallback), always-tappable qty pills (view + edit), source badge
  (plan.meta; demo-seeded 'pdf' in mock), importedMeta line, tapHint copy. `PortionPop.tsx`
  (new): Card A live daily totals + Card B editor (slider + numeric A6 clamp/snap, Done-only-
  closes). View-mode tap commits via setPortion; id-less item = guarded no-op (A2). Edit-mode
  unchanged. Onboarding threads source (pdf/text) → savePlan. 3 screen tests.
- **APP-080** — `muscleExercises.ts`: `muscleIntensities()` (primary/secondary tiers,
  muscleRoles or first-listed fallback; A9 deviation) + role-aware exercisesForMuscle.
  `BodyMap.tsx`: `absolute`/`selected` props, `sideOf` auto-flip, `shapesCenter`, breath pulse
  (AnimatedG withRepeat). `workout/[id].tsx`: intensity opacities, tinted banner + role tag,
  tinted chips, tint(accent,9) row highlight, auto-flip. 6 tests.
- **APP-081** — `health/healthConnect.ts`: +`readSessions`/HcSession (stub → [], A8 iOS/Expo
  captures-only). `workout/history.ts` (new): mergeHistory + exerciseTypeKey (pure). `[id].tsx`:
  vertical history rows (captured + HC, VIA CAPTURE/HEALTH CONNECT, date tile, chevron) replacing
  the strip; HC preview via minimal adapter (sourceOverride). `PreviewSheet.tsx`: §7.2 accent
  tints (date tile, chips, 24px index tiles), honest SRC. SourceBadge → "Logged by" avatar card.
  3 tests.

Ponytail ledger (deliberate): tint() sRGB not oklab; plan.meta device-local kv; no HC/capture
de-dupe; exercise-row bg instant swap (no 300ms tween); micros all-or-nothing; opacity changes
instant (breath is the animated element). All noted in app-spec §10.
**Next: Fable lead review → orchestrator gates+commit; deploy round (APK).**

---
## Attempt 2 — Fable lead review fix (2026-07-22)

Attempt-1 partial builder code was reverted; this attempt started from the clean tree +
amended spec. Full APP-075..081 build was re-executed and is in place. Lead's adversarial
review found 1 CRITICAL, fixed exactly:

- **Home eating-plan row missing portion overlay** (spec §3.1) — `src/tabs/Home.tsx` L706
  computed `planDailyTotals(plan)` without portions, so after a portion adjust the Home kcal
  contradicted the Eating Plan screen. Fixed: import `getPortions` from `../db/plan`, call
  `planDailyTotals(plan, getPortions())`. Home already subscribes to `useLogVersion` and
  `setPortion` calls `logChanged()`, so the row refreshes live. One line + import.

Gates all green: tsc 0 · Jest 250/250 (47 suites) · api:check no drift (v0.6.0).
