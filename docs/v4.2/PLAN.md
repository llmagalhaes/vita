# Vita v4.2 — Reconciled plan (manual plan + training builders)

> Orchestrator reconciliation of `app-plan.md` + `backend-plan.md` (2 Opus leads, session 23,
> 2026-08-24) against `HANDOFF_v4.2_manual_setup.md` (committed alongside) and CEO Rounds 15–16.
> This file is binding where the two team plans disagreed; everything not named here stands as
> written in the team plans.

## Headline

Two builders (eating plan `bmOn`, training `bwOn`) ride the **existing** save paths — `POST /v1/plan`
and `POST /v1/program` — with **contract v0.9.0** (8 deltas, all additive except one relaxation).
The "Fill in the calories for me" pass is the CEO's Round-16 **hybrid**: our own seeded food table
first (TACO ~597 rows, PT-BR), estimate cache second, **Claude only for misses**, write-back
automatic into the cache / curated into the seed. Same model for exercises (EXCAT seed +
free-exercise-db ~870 rows, public domain; wger rejected — CC-BY-SA).

## Reconciliation decisions (where the plans disagreed)

| # | Topic | Decision |
|---|---|---|
| R1 | **Estimate mark after save** (app Q1 vs backend D2/D3) | The mark **persists** — `PlanItem.kcal` + `kcalEstimated` land in v0.9.0 as backend specced, and the app renders `~`/dashed on plan surfaces too. The constitution ("estimates labeled as estimates") decides this; it is not a CEO question. One APP ticket added for the plan-surface rendering (APP-134). |
| R2 | **Estimation endpoints** | Backend names win: `POST /v1/estimate/food-kcal` and `POST /v1/estimate/exercise-muscles` (app plan assumed `/plan/estimate` before backend-plan existed). App's `src/plan/estimateKcal.ts` seam unchanged, just points at the real path. |
| R3 | **Contract gaps** | Backend's deeper read stands: D1 `minItems 1→0`, D2/D3 item kcal+flag, D4 `Exercise.durationMin`, D5 `wholeBody`, D6 `traps` in the vocabulary (+ normalize chokepoint on POST/PUT /program), D7/D8 the two endpoints. App plan's "only gap is minutes" is superseded. |
| R4 | **Rounding** | Multiple-of-5 / floor-5 is computed **server-side** (one place, both the table and Claude paths); the app's on-device FKG/FKU copy applies the same formula for mock/offline only. |
| R5 | **App ticket numbers** | Renumbered **APP-115…APP-133** (+ APP-134 from R1) — APP-113/114 were consumed by today's v4.1 rounds on Asana. |

## Roadmap (waves)

**Wave 0 — contract (blocks everything):** BE-057 (v0.9.0 + ADR-0020) → app regenerates types.
**Wave 1 — parallel:**
- Backend: BE-058 (plan save path) · BE-059 (program save path) · BE-060 (V013 food table + TACO seed + matching) · BE-062 (V014 exercise table + seeds)
- App: wave 0–1 of `app-plan.md` (APP-115 foundation: catalog/estimate-seam/BodyMap props/skel(n)/i18n block up-front → the three disjoint builders: food / training / entry-points)
**Wave 2:** BE-061 (`/estimate/food-kcal`) · BE-063 (`/estimate/exercise-muscles`) ∥ app estimation wiring + review phase + APP-134 (plan-surface `~`).
**Wave 3:** app keyboard pass + the 23-criteria emulator drive (handoff §6) · BE-064 image + **deploy vita:11** + prod probes · fresh APKs.

Sizes: backend ~3–3.5 days of agent waves; app 19+1 tickets across 3 builder waves. Build rounds run
per the house pattern (parallel Opus builders on disjoint files → adversarial lead reviews →
orchestrator gates/commits).

## CEO answers (Round 16, 2026-08-24 — ALL DECIDED, nothing open)

1. **TACO licence** — default confirmed: ship now, settle (UNICAMP permission or USDA rebuild under our own PT-BR name list) before Play Store.
2. **"Build it here" over an existing plan/program** — default confirmed: **replace** (same semantics as "Import a PDF — replaces the plan you have now"; previous kept in history), warning in the route subtitle.
3. **Spoken route for programs** — default confirmed: gone, per handoff.
4. **CHANGED — hand-built days KEEP the `~kcal` line** ("as kcal vão ser estimadas, tanto pelo usuário quanto pela IA, portanto vamos manter"): the training builder gets a per-day kcal — user-typed OR estimated. **New delta D9: `POST /v1/estimate/workout-kcal`** ({exercises:[{name,fam,sets,reps,min}]} → {kcal, estimated}) feeding the existing `ProgramDay.kcalEstimate` (no schema change there). **New tickets: BE-065 (endpoint, S, needs BE-062's table for meta) + APP-135 (builder day-kcal field + estimate button, S)** — both land in Wave 2 alongside the other estimate wiring.
5. **Claude-guessed exercise muscles** — default confirmed: pale band only; low confidence stays `not mapped`.

(Resolved without the CEO: estimate mark persists — R1; `traps` added — D6, the chip finally lights; kcal-only now with macros stored in the table from day one — backend Q4 default.)
