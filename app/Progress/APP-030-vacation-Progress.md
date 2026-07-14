# APP-030 — Vacation mode (slice 7, F10) — Progress

**Asana:** APP-030 (Vita frontend `1216519867368576`) — "date-range sheet, sea-tone accent via one state-driven token source, Home banner, notification pausing, trends hide-days, trip habit by voice. Resulting ranges sync to backend (D1)."
**Backend gate:** BE-025 (`GET/PUT /me/vacations`) — consumed from the committed contract; vacation types already present, no regen.

## What was built

### Vacation data — `src/db/vacation.ts`
`VacationConfig = { ranges: VacationRange[], keepCheckins: boolean, tripHabitIds: string[] }` in kv (offline-first, same pattern as `src/db/plan.ts`).
- **Only the ranges leave the device (D1)**: `saveVacation`/`endVacation` write kv first (instant) then `PUT /me/vacations` fire-and-forget (replace-on-write); the server stores an opaque blob it never reads (BE-025). `keepCheckins` and trip habits are device-local.
- `syncVacation()` hydrates the ranges from `GET /me/vacations` on mount; keeps the cache + reflects local state to the accent immediately for an offline cold start.
- `isVacationActive(today)` / `vacationRanges()` / `vacationKeepsCheckins()` read the cache.

### One state-driven accent token — `src/ui/accent.ts`
A single external store: `getAccent()` / `useAccent()` return the default earthy accent or `colors.vacationAccent` (sea tone). `saveVacation`/`endVacation`/`syncVacation` flip it via `setVacationAccent(isVacationActive())`. The always-present **capture pill** (mic + active nav) subscribes via `useAccent()`, so the app visibly shifts to the sea tone. No theme fork — one switch drives it; other screens opt in by swapping `colors.accent → useAccent()`.

### Vacation setup sheet — `src/vacation/VacationSheet.tsx`
Modal bottom sheet (sea tone): date range (two `YYYY-MM-DD` inputs, validated by pure `isValidDate` + start≤end), a **Keep check-in reminders** toggle, and **add a trip habit** (typed **or** spoken — the mic fills the field via the app recognizer, dual input). Trip habits are ordinary local habits (all days, enabled); Cancel cleans up any speculatively-created ones. Start → `saveVacation`.

### Home banner + notification pausing
- Home shows a **sea-tone vacation banner** (dates + End) when `isVacationActive()`; `syncVacation` runs on Home mount.
- **One notification gate** in `src/habits/notifier.ts`: `notificationsPaused()` = master switch off **or** (on vacation **and** check-ins not kept). `refreshNotifications` syncs `[]` (cancel all) when paused. Both the Account toggle and vacation start/end feed the same gate.

### Trends hide-days
`app/(main)/trends.tsx` now feeds the **real persisted ranges** — `vacationExcluder(vacationRanges())` — into slice-6's already-wired aggregation hook. No aggregation change needed; vacation days drop from every stat line.

## How vacation ranges flow
`VacationSheet.start` → `saveVacation({ranges,...})` → kv (instant) + `PUT /me/vacations` (fire-and-forget, D1) + `setVacationAccent` + `refreshNotifications`. On next launch `syncVacation()` (Home mount) does `GET /me/vacations` → kv. `trends.tsx` reads `vacationRanges()` → `vacationExcluder` → per-day exclusion. Server never interprets the blob (BE-025).

## Tests — `src/db/__tests__/vacation.test.ts`
Ranges **persist to the backend** (`putVacations` called with the ranges, replace-on-write), `isVacationActive` in/out of range, **the real ranges drive the trends excluder**, `endVacation` clears server + local, `syncVacation` hydrates from the backend. 5 tests. (Notifier stubbed to avoid expo-notifications.)

## Gates
`tsc` clean · `jest` green · `api:check` no drift · `expo export` iOS OK · SDK 56.

## ponytail
- Accent reactivity applied to the always-present chrome (pill) + Home banner — the most-seen surfaces; full-app accent is a one-line swap per screen, noted as the ceiling in `accent.ts`.
- "Keep these notifications" modeled as ONE boolean (check-ins are the only real notifications), not the prototype's multi-chip.
- Date entry is validated text (`YYYY-MM-DD`) rather than a native picker dep — two fields, no new dependency.
- Trip-habit mic reuses the app's stub recognizer (streams the demo phrase in Expo Go, editable); real STT arrives with APP-007.
