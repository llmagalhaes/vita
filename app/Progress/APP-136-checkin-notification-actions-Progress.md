# APP-136 — Actionable check-in notifications (Yes/No) + duplicate fix

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1217818580968634
Session 25 · Opus builder · 2026-08-25

CEO report (Samsung screenshot): habit check-in notification "Ômega-3 (…) — a quick
check-in" had no way to answer it, and it arrived **twice**, both stamped 10:45.

## Files changed

| File | What |
|---|---|
| `src/notify/notifier.ts` | `HABIT_CATEGORY` / `HABIT_ACTION` / `habitNotifId`; `sync()` sets the category and schedules with stable ids + `categoryIdentifier`; `NotificationResponse` gains `id` + `firedAt`; `Notifier` gains `dismiss()` + `lastResponse()`; **`refreshNotifications` serialized**; stub extended |
| `src/notify/dayClose.ts` | `habitActions()` (button copy); one `handleResponse` for day-close AND habit answers; cold-start replay of the OS-queued response inside `startDayClose` |
| `src/habits/checkins.ts` | `applyCheckinAction(actionId, habitId, firedAt)` — maps the button to the existing `answerCheckin` chokepoint, dates the answer from the fire time, guards double-apply |
| `src/i18n/locales/en.json` | `notify.habitYes` = "Done", `notify.habitNo` = "Not today" |
| `src/notify/__tests__/notifier.test.ts` | +1: three concurrent `refreshNotifications` leave one alarm per habit+weekday |
| `src/habits/__tests__/checkins.test.ts` | +4: writes the same check-in, double-apply guard (incl. in-app answer wins), plain tap / unknown habit, fired-day dating |
| `src/notify/__tests__/dayClose.test.ts` | +2: Yes from the shade records + dismisses; cold-start replay applies before the card, listener replay is a no-op |

## The duplicate — root cause

`refreshNotifications()` was **not serialized**, and `sync()` is
`cancelAllScheduledNotificationsAsync()` → loop of `scheduleNotificationAsync()`, with
`await`s throughout and **no identifiers** (expo generated a random uuid per alarm).

Boot alone fires three callers: `startAppSync()` (direct), `syncVacation()` →
`refreshNotifications`, `syncSettings()` → `refreshNotifications` — plus habit toggles,
plan setup and account. Two overlapping calls interleave as

```
A cancelAll · B cancelAll · A schedule(h1…) · B schedule(h1…)   → two alarms per habit
```

Neither cancel sees the other's writes, and random ids mean nothing collapses them.
That is two identical notifications at the same minute.

**Fix (chokepoint, both halves):**
1. `refreshNotifications` runs on one promise chain — never two schedule passes at once.
2. Habit alarms carry a stable identifier `habit.<habitId>.<weekday>`, so even a missed
   serialization *replaces* the alarm instead of adding one.

## Android reality of the three response states (read from the installed package)

`expo-notifications@56.0.20`, `android/src/main/java/expo/modules/notifications/`.

- **Foreground / backgrounded (process alive)** — works fully. The action's PendingIntent
  is a broadcast (`NotificationsService.createNotificationResponseIntent`, non-foreground
  branch since `opensAppToForeground=false`), `ExpoHandlingDelegate.handleNotificationResponse`
  finds a live listener and emits `onDidReceiveNotificationResponse`. The app does NOT come
  to the foreground. We write the check-in, drain the outbox, and dismiss.
- **Process dead** — honest answer: **the answer applies on the next app open, and only if
  the process the broadcast started is still alive then.** `ExpoHandlingDelegate.kt:158-163`:
  *"the listeners are not set up when the app is killed … this code is a noop in that case"* —
  the response goes into a **static in-memory** `sPendingNotificationResponses`, flushed to
  JS when the emitter module registers (`addListener`). There is no disk persistence
  (`NotificationsEmitter.lastNotificationResponseBundle` is a field, not SharedPreferences),
  so if Android reaps that process before the user opens Vita, the press is lost. Making it
  durable would require a headless background task (`expo-task-manager` +
  `registerTaskAsync`) — not installed, not built (ponytail: out of scope, flag if the CEO
  wants it).
- **Cold start after a press that DID survive** — `startDayClose()` reads
  `getLastNotificationResponse()` **synchronously** (it is a sync native `Function`, not a
  promise) before the Day's `HabitsCard` reads the db, so an answered check-in never
  reappears as pending. The same response arriving again via the live listener is absorbed
  by the `getCheckin(habitId, date)` guard in `applyCheckinAction`.
- **Dismissal** — Android does **not** auto-cancel on an action press
  (`ExpoNotificationBuilder` sets `setAutoCancel` for the body tap only), so we call
  `dismissNotificationAsync(id)` ourselves. With a dead process the notification therefore
  stays on the shade until the app next runs. Known ceiling, same cause as above.

Two other things read out of the source rather than guessed:
- `options.opensAppToForeground` **is** honoured on Android (`ExpoNotificationCategoriesModule.kt`,
  default `true`) — the day-close category deliberately keeps the default.
- Category identifiers must avoid `:` and `-` (package docs) → `vitahabitcheckin`,
  `habityes` / `habitno`. The pre-existing `vita-day-close` is left alone (it works today).

## Dating the answer

A weekly habit alarm cannot carry a `date` in its payload (one trigger, many days), so the
answer is dated from `notification.date` — the OS delivery time, surfaced as
`NotificationResponse.firedAt`. "Done" pressed at 07:00 the morning after a 21:00 reminder
lands on the day it was asked about, the same rule as the day-close notification.

## Gates

- `npx tsc --noEmit` → **0**
- `npx jest` → **75 suites, 600 passed / 1 skipped** (baseline 593 passed; +7 tests)
- **No native change.** Categories are a runtime API; the broadcast receiver and
  `NotificationForwarderActivity` come from expo-notifications' own merged manifest, and
  `android/app/src/main/AndroidManifest.xml` is untouched → **no `expo prebuild` needed**,
  the existing prebuilt `android/` stays valid.

## Not done (deliberate)

- Durable answers while the process is dead (headless `expo-task-manager` task). Add when
  the CEO says losing an occasional shade press matters.
- pt-BR button copy: the app ships one locale file (`en.json`); no locale was added.
