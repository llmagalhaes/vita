# R18-C — answering a check-in from the shade must not open the app

Session 25 round 18 · Opus builder C · 2026-08-28
CEO (real Samsung, release build): *"tapping the Yes/No action on the check-in
notification OPENS THE APP — apenas logar."*

## What the library actually does on Android (`expo-notifications@56.0.20`, read from source)

`opensAppToForeground` **is** plumbed for category actions on Android in this version —
it is not iOS-only. Two gates, both honouring it:

| File:line | Code | Effect |
|---|---|---|
| `notifications/categories/ExpoNotificationCategoriesModule.kt:49-52` | `class Options : Record { @Field val opensAppToForeground = true }` | JS `options.opensAppToForeground` → the Kotlin record. **Default `true`** — a missing/mis-shaped `options` silently means "open the app". |
| `.../ExpoNotificationCategoriesModule.kt:101,110` | `NotificationAction(id, title, actionMap.options.opensAppToForeground)` | flag stored on the action |
| `service/delegates/SharedPreferencesNotificationCategoriesStore.kt:72-80` | `saveNotificationCategory` → base64 Java serialization in SharedPreferences | **the flag is persisted per device, survives app updates** |
| `presentation/builders/ExpoNotificationBuilder.kt:45,68-79` | `store.getNotificationCategory(id)` → `buildButtonAction` | the buttons are built **from the store at present time**, not from the scheduling call |
| `service/NotificationsService.kt:478-489` | `if (action.opensAppToForeground() && SDK_INT >= S) return createPendingIntentForOpeningApp(...)` else `PendingIntent.getBroadcast(...)` | **`false` ⇒ plain broadcast — no Activity in the PendingIntent at all** |
| `service/delegates/ExpoHandlingDelegate.kt:140-142` | `if (notificationResponse.action.opensAppToForeground()) openAppToForeground(...)` | the receiver only starts MainActivity when the flag is true |
| `service/NotificationForwarderActivity.kt:22` | `openAppToForeground(this, ...)` unconditionally | only ever reached via the `true` branch above |
| `service/delegates/ExpoHandlingDelegate.kt:156-166` | *"the listeners are not set up when the app is killed … this code is a noop"* | dead process ⇒ response parked in a **static in-memory** list |

Conclusion: **there is no path in this version that foregrounds the Activity for an
action whose stored flag is `false` on SDK ≥ 31.** Which inverts the question — if the
CEO's device foregrounds, the flag *stored on his device* is `true`.

Corollaries checked and cleared: the app manifest declares no
`expo.modules.notifications.OPEN_APP_ACTION` activity (so `getMainActivityLauncher` is
the only launcher, foreground branch only); `expo.modules.notifications.NOTIFICATION_EVENT`
is declared by the module's own merged manifest (so the broadcast is explicit, not
blocked); `expo-task-manager` is not installed, so
`FirebaseMessagingDelegate.runTaskManagerTasks` is a no-op; PendingIntent request codes
collide across actions but the data URIs (`…/<notifId>/actions/<actionId>`) differ, so
`filterEquals` keeps them distinct.

## What changed (`src/notify/notifier.ts` only)

1. **`HABIT_CATEGORY` versioned `vitahabitcheckin` → `vitacheckin2`.** The category is
   persistent OS state, and the buttons on a presented notification are built from that
   store — not from the schedule call. A device that once stored the category with
   `opensAppToForeground: true` keeps opening the app until the entry is *actually*
   rewritten; a new identifier is a guaranteed-fresh write and the stale entry is simply
   never read again. (Registration already ran on every `sync()`, i.e. every boot with
   habits — kept.)
2. **`habitCategoryActions()` extracted + unit-tested.** The option shape is the entire
   feature and it fails *silently* (native default `true`); it now has the one runnable
   check that breaks if the shape drifts.
3. **Read-back assertion.** `setNotificationCategoryAsync` resolves with what the OS
   actually stored (`ExpoNotificationsCategoriesSerializer.toBundle` serializes
   `options.opensAppToForeground` back out of the store). `storedOpensApp()` inspects it
   and `console.warn`s `[notify] vitacheckin2 stored opensAppToForeground=true …`. One
   `adb logcat -s ReactNativeJS` on the CEO's next drive turns this from a theory into a
   fact — and if it never logs, the flag is right and the residue is the ceiling below.

Untouched, re-verified by reading: `dayClose.ts:146` still dismisses
(`if (r.id) void getNotifier().dismiss?.(r.id)` — Android does not auto-cancel an action
press) and `checkins.ts:120` still guards double-apply
(`if (getCheckin(habitId, dateKey(when))) return false`). `HABIT_ACTION` identifiers are
unchanged, so `applyCheckinAction` needed no edit.

## Ceiling (honest, unfixable from JS)

- **Dead process.** The broadcast starts the app *process* (no Activity), but the JS
  runtime isn't up, so the response parks in `sPendingNotificationResponses` and is
  applied at the next open via the existing `getLastNotificationResponse()` drain — and
  the notification stays on the shade until then. Durable answering needs
  `expo-task-manager` + `registerTaskAsync` (a headless task). Not installed, not built.
- **Shade collapse.** `NotificationCompat.Action` is built without
  `setShowsUserInterface(false)` (`ExpoNotificationBuilder.kt:79`), so SystemUI dismisses
  the keyguard and collapses the shade on the press. If Vita was the last resumed task
  that *reads* as "the app opened" even though no Activity was started. Not reachable
  from JS — it would need a patch to expo-notifications.
- **Day-close category** (`vita-day-close`) still registers its two actions with the
  native default (`true`) — deliberate, `applyDayCloseAction` navigates to `/day`. If the
  CEO wants "Close as planned" to be silent too, that is the same one-line change plus
  dropping the `router.replace`. Not done: out of this ticket's scope.

## Prebuild

**NOT required.** Categories are a runtime API; no manifest, plugin or native change.
`android/app/src/main/AndroidManifest.xml` untouched, the existing prebuilt `android/`
stays valid. A **fresh APK is required** (JS change), install over the top is fine —
the versioned identifier is what makes the fix land without a clean install.

## Gates

- `npx tsc --noEmit` → **0 errors in `src/notify`** (3 pre-existing errors in
  `src/ui/__tests__/popHost.test.tsx`, another builder's in-flight file).
- `npx jest` → **628 passed / 1 skipped**, +1 test from this ticket. The single failure
  (`src/nav/__tests__/panelShell.test.tsx` "a tab tap routes") is in `src/nav`, another
  builder's in-flight file — this ticket touches nothing outside `src/notify`.
