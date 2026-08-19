# APP-110 — user_settings blob sync

Session 22 (v4 round). Builder: Opus. Spec: `docs/v4/backend-persistence-analysis.md` §4 (+§4.2
the hazard), contract v0.8.0 `GET/PUT /me/settings` (BE-056), CEO Round-14 rules: **one opaque
JSON blob · last-write-wins · recovery-only single-device · silent (no UI)**.

## What shipped

**`src/db/settingsSync.ts`** (new, the whole feature) —

- `assembleBlob()` reads the synced stores into one plain object:
  ```json
  { "domains": {"meals":true,"water":true,"move":true,"habits":true,"weight":true},
    "notificationsEnabled": true, "notifRecap": true, "recapStartHour": 20,
    "vacation": {"keepWater": false, "duration": "thisWeek"},
    "planMeta": {"source":"pdf","importedAt":"2026-07-23T18:02:11Z"},
    "habits": [{"id":"8f2c…","name":"Tomar remédio","days":[…7],"time":"08:00",
                "enabled":true,"kind":"plain","createdAt":"2026-07-19T…"}] }
  ```
  Absent fields are omitted, never sent as `undefined`.
- `adoptBlob(b)` writes it back: settings kv (`domains`, the two switches, `recapStartHour`),
  habits via `restoreHabit` (`INSERT OR REPLACE` — ids and `createdAt` verbatim, so restored
  `habitId:date` check-ins still point at their habit), vacation prefs via the new
  `adoptVacationPrefs` (ranges untouched — they have their own resource), `plan.meta` via the
  new `adoptPlanMeta`. **Additive: it deletes nothing local.** Ends with `logChanged()` +
  `refreshNotifications()` so restored habits get their reminders back.
- `syncSettings()` — **hydrate before push**. GET first; adopt a non-empty blob (unless the
  local copy is `dirty`); only then is pushing enabled. A failed GET leaves the module
  **unhydrated on purpose** → a fresh install can never PUT its defaults over the stored blob.
  In-flight-shared (session load + Home mount fire together → one GET); idempotent afterwards.
- `scheduleSettingsPush()` — debounced 1.5s full-blob PUT, hung off the existing `logChanged`
  signal (new `onChange` export in `src/db/notify.ts`), comparing a **key-sorted** serialization
  against the last blob the server accepted → a burst of toggles is one request and an unrelated
  meal log is zero. Failure leaves the `settings.blob` dirty flag set (`src/db/kv.ts`, the same
  flag plan/vacation use) so the next change / mount / reconnect re-pushes, and so the next
  launch re-pushes instead of adopting over the unpushed edit (audit 1.4).
- `resetSettingsSync()` on sign-out — the baseline belongs to the account that was signed in.

**Deviation from the ticket sketch (justified):** *no outbox op*. The blob is not a queue of
edits, it is one replace-on-write document with a single writer; an outbox op would need
coalescing, an op type, and a drain branch to do worse than a debounced PUT + the dirty flag
that already exist. Retry-on-reconnect is one line in `startReconnectDrain`.

**Wiring (3 one-liners + 1):** `app/_layout.tsx` (after `loadSession()`, beside APP-111's
restore hook), `src/tabs/Home.tsx` mount (safety net — catches habits created by plan-setup,
which does not fire `logChanged`), `src/db/reconnect.ts` (offline launch → hydrate on reconnect),
`src/auth/session.ts` `persist(null)` (sign-out reset, lazy require).

**Supporting edits:** `src/api/client.ts` `getSettings`/`putSettings` + `SettingsBlob` type ·
`src/api/mock.ts` stores the blob verbatim (`{}` until first written) · `src/db/notify.ts`
`onChange()` (`useLogVersion` now uses it) · `src/db/plan.ts` `adoptPlanMeta` ·
`src/db/vacation.ts` `adoptVacationPrefs`.

## Not synced (Round-14, deliberate)

Integrations toggle (a toggle without the OS grant is a lie) · the name (`GET /me`) · UI hints
(`nav.swiped`, `int.promptDismissed`, `plan.setupPromptHidden`, `onboarded`, `seeded`) · caches
and the outbox · `day.overlay` / `day.closed` · Health Connect data · `workout.daySkips`/
`selectedDay` · dirty flags · the auth session. Vacation **ranges** are excluded because they are
already persisted by `/me/vacations`; only `keepWater` + `duration` ride the blob.
`vacation.tripHabitIds` no longer exists (APP-103 dropped trip habits) — nothing to sync.

## Tests — `src/db/__tests__/settingsSync.test.ts` (new, 7)

fresh-install hydrate populates habits + domains + recapStartHour (and does **not** push) ·
local change → exactly one debounced PUT carrying the full blob and only the synced keys ·
empty server blob `{}` → no adoption, no PUT, first local change pushes · **no PUT ever happens
before the first GET resolves** (the hazard; local writes during the in-flight GET push only
after it lands) · offline GET → never hydrated, never pushes, hydrates on the retry · failed push
stays dirty → next launch re-pushes the local edit instead of adopting the server copy ·
`adoptBlob` deletes nothing and tolerates a partial blob.

## Gates (orchestrator-verifiable)

- `npx tsc --noEmit` → **0 errors**
- `npx jest src/db src/api` → **14 suites / 110 tests pass** (+7 net new; 117/15 including
  `src/auth` after the sign-out hook)

## Ceilings

- `ponytail:` LWW with no merge — correct for one device. Two devices editing concurrently
  would lose one side; the flip path is splitting `habits` into their own resource (they already
  carry stable ids).
- A change made offline on a device that never managed a push is adopted over by the server copy
  on the next successful GET (recovery posture: an unpushed blob cannot outrank the restored
  one). Habits created offline survive regardless — adoption never deletes.
