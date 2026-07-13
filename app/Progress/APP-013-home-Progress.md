# APP-013 · Home / Today screen — Progress

- Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216514542149257
- Status: **built, tests green** (2026-07-13). Done = in production.

## What exists

- `app/(main)/home.tsx`, rendering **entirely from SQLite** (`entriesForDay` + `useLogVersion` change signal):
  - Greeting (time of day + name from settings) and date.
  - "Logged today" kcal hero with the **estimates** tag (sum of meal totals).
  - Water card: total, expandable log list, **quick add +250 ml through the outbox**.
  - Macros card: P/C/F bars (`Bar` primitive), relative to the day's max macro.
  - Energy card: consumed real / spent 0 (health source arrives with the health-sync wave), in/out bars, expandable 7-day placeholder pairs.
  - Eating plan row (only when a plan was confirmed in onboarding).
  - Today timeline: cards with `WaveIllustration` (prototype wave paths per entry kind), input-method sub ("Logged by voice · 08:10"), kind-colored badge (kcal/ml/min), staggered FadeIn, **pending entries show "waiting to sync"**.
  - Calm empty state.
- New `src/ui` primitives: `EstimateTag`, `Bar`, `WaveIllustration` + `entryPalette`.
- `app/(main)/trends.tsx` / `habits.tsx`: factual placeholders so the pill shortcuts never dead-end.
- Tests: 2 RNTL (entries render with estimates label + pending marker; empty state).

## Deliberate cuts

- Check-ins banner and cycle chip: omitted until the habits and health waves (no dead taps). Vacation banner: vacation-mode wave.
- Wave line draw-on animation static for now (Skia/animated-path later fidelity pass).
- Energy "spent" is 0/placeholder — needs health ingestion (wave 4+).
