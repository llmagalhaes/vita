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
