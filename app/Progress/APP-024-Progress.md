# APP-024 — Habits "Manage" (SQLite domain + CRUD)

Asana: Vita frontend `1216519867368576` (slice 4, F6). Local-100 backlog F6.

## What shipped
- **Device-local habits domain** (`src/db/habits.ts`, D1 — definitions never leave the phone):
  `Habit { id, name, days:boolean[7] (0=Sun), time "HH:MM", enabled, kind: "plain"|"plan",
  planMealName?, createdAt }`. CRUD: `listHabits/getHabit/createHabit/updateHabit(partial)/deleteHabit`.
  New `habits` table in `src/db/db.ts` SCHEMA.
- **Habits screen** (`app/(main)/habits.tsx`) — replaced the placeholder. Today | Manage tab switch.
  Manage tab: "+ New habit" form (type plain/plan, name, HH:MM time, tappable day chips, plan-meal
  picker when a cached plan exists) + habit rows (enable toggle, 14-day dot strip, expand → day chips
  + time + remove). Philosophy footer: "A single yes or no per check-in — no streaks, no scores."
- Habit CRUD calls `logChanged()` (reuses the existing log-version signal so screens re-read) and
  `refreshNotifications()` (APP-026). First save asks notification permission calmly.
- Demo habit seeded (mock mode) so Today/Manage and the Home banner have life on first launch.

## Notes / ponytail
- No streak counters, no scores — dots are a plain 14-day yes/no history, not a "streak".
- Voice-add-a-habit (prototype `addHabitVoice`) skipped — the pill mic logs entries, not habit defs;
  add if the CEO wants it (needs a small parse path). The form is dual-input (tap chips + typed name/time).

## Tests
`src/db/__tests__/habits.test.ts` — CRUD round-trip, partial update, plan-meal link, list order, delete.
