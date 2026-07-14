# APP-029 — Account & Integrations (slice 7, F9) — Progress

**Asana:** APP-029 (Vita frontend `1216519867368576`) — "Account screen (profile expand; units apply everywhere via PATCH /me; Your setup deep-links; notification toggles drive APP-026; sign out) + Integrations screen as honest UI-only toggles."
**Backend gate:** none — prefs stay local (D1).

## What was built

### Account screen — `app/(main)/account.tsx`
- **Profile card, expandable** → edit **Name** (`setName`) and **Units** (`setUnits`). Both apply everywhere locally and mirror to the server via `PATCH /me`. Home/detail screens re-read units on the log-version bump.
- **Your setup** deep-links: Eating plan → `/plan`, Training program → `/program`, Integrations → `/integrations`, Habits → `/habits`. Subtitles read the persisted plan/program (`getCachedPlan/Program`) and habit count.
- **Notifications**: master "Check-in reminders" toggle → `setNotificationsEnabled` + `refreshNotifications()` (drives the APP-026 Notifier through the single gate).
- **Away**: vacation card (Set up → `VacationSheet`; End → `endVacation`) — see APP-030.
- **Your data**: "Export to…" → `ExportSheet` (APP-031).
- **Sign out** → `session.signOut()`.

### Integrations screen — `app/(main)/integrations.tsx`
- **Honest UI-only toggles** for 6 sources (Apple Health, Health Connect, Strava, Garmin, Flo, Gym app). Each persists a device-local pref (`setIntegrationEnabled`) and does nothing else — copy is explicit: "Connect a health source", "Arrives with the full app", and a footer that says live sync isn't in this build and Vita never shows synced data it doesn't have. Real health sync stays in the blocked appendix (APP-007).

### Supporting
- `src/db/settings.ts` grew `notificationsEnabled?`/`integrations?` (both optional, default-safe for pre-existing profiles) plus helpers `setName`/`setUnits` (PATCH /me mirror), `notificationsEnabled`/`setNotificationsEnabled`, `integrationEnabled`/`setIntegrationEnabled`. All bump the log version so screens re-read.
- New `src/ui/Toggle.tsx` — the earthy on/off switch, reused by Account, Integrations, Vacation.
- Home header gained a top-right **account button** (only new entry point; Trends/Habits already live on the capture pill).

## Tests
- `src/db/__tests__/settings.test.ts` — **units/name PATCH propagation** (local + `patchMe` mirror), notifications default-on + local-only, integration prefs local. 4 tests.
- `src/__tests__/account.test.tsx` — Account renders its sections; changing units in-profile updates settings. 2 tests.

## Gates
`tsc` clean · `jest` green · `api:check` no drift · `expo export` iOS OK · `expo install --check` up to date, SDK 56.

## ponytail
- Notification prefs modeled as ONE master switch (the only real notifications are check-ins), not the prototype's two rows — honest and enough.
- Account button icon is a glyph, not the prototype's SVG person — same affordance, less code.
