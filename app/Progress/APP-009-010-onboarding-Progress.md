# APP-009/010 · Onboarding (6 steps) — Progress

- Asana: APP-009 https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216519895050566 · APP-010 https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216534967655094
- Status: **built, tests green** (2026-07-13). Done = in production.

## What exists

- `app/onboarding.tsx` — single route, 6 steps with progress bars, back button, FadeIn transitions, bottom CTA (Next/Start). Next disabled only while the name is empty; plan/program left unanswered = "none" (skippable paths tested).
  1. Welcome: name + metric/imperial, organic blob illustration (SVG per prototype).
  2. Keep an eye on: 5 chips, copy "Just your own reference — Vita never sets targets or scores."
  3. Eating plan / 4. Training program: **one shared component** `src/onboarding/PlanStep.tsx` (describe / paste-import / none → phrase quoted → summary card with estimate tag → "Looks right" / Adjust / clear).
  5. Connect apps: Apple Health + Health Connect UI-only toggles; Garmin/Strava/Flo/gym shown "Arrives in v2".
  6. All set: recap rows, philosophy note, "Try it — say what you ate today."
- Finish: settings → SQLite kv, `onboarded` flag, fire-and-forget `PATCH /me` (offline-tolerant — kv is local truth), replace to /home.
- Tests: full walk-through + skip-path (2 RNTL tests, all copy asserted through i18n).

## Deliberate cuts / notes

- Plan/program summary is a **client-side mock read-back** (title + bullets from the user's words). The v0 contract has **no plan-import endpoint** — real AI read-back needs a contract addition (raised below). PDF/gym-app pickers deferred: both routes currently share the paste-as-text box with a factual note.
- Voice answers per step land with APP-012 (layout leaves the capture surface free).
- Connect toggles are UI-only until the health-sync wave (per ticket).

## Dependency raised

- **Backend (via orchestrator): plan/program parse-import endpoint** (free text → structured summary) is needed before onboarding steps 3–4 can round-trip for real. Not in vita-api-v0.yaml (declared out of v0 scope there).
