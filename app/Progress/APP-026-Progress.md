# APP-026 — Local notifications

Asana: Vita frontend `1216519867368576` (slice 4, F7). Local-100 backlog F7. Backend: none (local only).

## What shipped
- **`Notifier` interface + expo-notifications impl** (`src/habits/notifier.ts`), same
  interface-behind-a-native-module pattern as STT (APP-012) / OIDC (APP-008):
  `getPermission` / `requestPermission` / `sync(habits)`. The native module is `require`d **lazily inside
  the methods**, so Jest and the mock build never load it.
- **Scheduling wired to habits**: `plannedNotifications(habits)` (pure) expands enabled habits into one
  weekly alarm per selected weekday (days index 0=Sun → expo weekday 1); `ExpoNotifier.sync` cancels all
  and reschedules via `scheduleNotificationAsync` (WEEKLY trigger). `refreshNotifications()` is called on
  every habit change (best-effort, never throws into the UI). `ensureNotificationPermission()` asks
  **once, only when undetermined** — never nags on "denied".
- **New dep** `expo-notifications ~56.0.20` (SDK-56 pinned, `expo install --check` clean) +
  `app.config.ts` plugin. Local scheduling works in Expo Go SDK 56 (iOS clean; Android may log a harmless
  warning — acceptable).

## Interactive lock-screen Yes/No — the one untrusted slice
Per the ticket, treated as best-effort and **not blocked on**: `sync` registers a `vita-checkin`
notification **category with Yes/No actions** (wrapped in try/catch) and each scheduled notification
carries `categoryIdentifier` + `data.habitId`, so the buttons *can* render in a dev build. The
**response→answer wiring is deferred to APP-007** (a real dev build is needed to verify the buttons
actually deliver in the OS shade — cannot be confirmed in Expo Go here). The **in-app check-in stack
(APP-025) is the guaranteed working path**; tapping a notification opens the app to it. `stubNotifier()`
is the injectable fallback (used by tests and available for APP-007).

## notify.ts
`src/db/notify.ts` is a log-change signal despite its name (0 notification/schedule code) — **no overlap,
nothing folded**.

## Tests
`src/habits/__tests__/notifier.test.ts` — weekday mapping, disabled/invalid-time skipped, every-day → 7
alarms, `refreshNotifications` drives the injected Notifier with the live habit set, permission asked only
when undetermined.
