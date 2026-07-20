# APP-058..061 — CEO device-test functional batch (session 14, 2026-07-20)

CEO device-tested the fresh prod APK (real prod backend) and filed 4 functional bugs.
Root causes below were proven against the **real prod backend** (magic-link → verify →
parse → POST /entries → refresh all exercised live). Gates: **tsc 0 · Jest 216/216
(43 suites, +5) · expo export iOS OK**. No backend code changed. One DevOps ticket needed
(APP-060 KMS). Tickets left In progress (DoD = store).

## Method
Retrieved a real prod magic-link token from CloudWatch `/ecs/vita`, verified it, and
drove `/parse/text`, `/entries`, `/uploads` + presigned S3 PUT, `/auth/refresh` directly
against prod (`https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1`). The prod
auth+parse+sync chain is **fully healthy** — see per-ticket findings.

---

## APP-061 (P0) — every entry ~0 kcal + stuck "waiting to sync"

### Root cause of "~0 kcal" — PROVEN, fixed
The real `/parse/text` returns meal drafts with `items` (real kcal) but **no `totals`**:
```
{"type":"meal","detail":{"items":[{"name":"banana","kcal":105,"carbsG":27,"proteinG":1,"fatG":0}]}}
```
Per the contract, "the server recomputes totals from items on write" — so parse never
sends totals. But every Home surface (hero, macros, energy, timeline: `Home.tsx`,
`tabs/home/Timeline.tsx`, `timelineData.ts`) reads `detail.totals.kcal ?? 0` → renders
**~0 kcal**. The in-process mock computes totals inline, which is why it always looked
fine in mock mode and the real backend never was.

**Fix (single chokepoint at the API boundary):** `src/api/client.ts` `fillDraftTotals()`
sums `items` into `totals` for meal drafts that lack them; applied in `parseText` and
`parsePhoto`. Idempotent (a draft that already has totals — the mock, or a future
backend — is untouched). This one place fixes the confirmation card, the stored entry,
AND the offline-interpret path (`outbox.interpretPending`) because all three route
through `api.parse*`. Regression tests in `parse-photo.test.ts` reproduce the exact prod
response.

### "waiting to sync" — NOT an API failure; latent boot bug fixed + instrumented
POST `/entries` returns **201** with a valid token and echoes server-computed totals;
`/auth/refresh` returns **200**. The whole sync chain works. So "waiting to sync" is a
device-side token/drain state, not reproducible against the healthy API. Two changes:

1. **Boot-ordering bug (`app/_layout.tsx`):** the startup `drainOutbox(api)` fired
   *before* `loadSession()` resolved → POST with no bearer → 401 → backoff, leaving
   prior-session entries stuck "waiting to sync" until the next user action. Now the
   drain runs in `loadSession().finally(...)`.
2. **Instrumentation (`src/db/outbox.ts`):** the network/5xx backoff branch was a silent
   swallow (`.catch(()=>{})` everywhere). Added a `console.warn("[outbox] sync backoff
   op=… entry=… attempts=… reason=HTTP 4xx|network …")`. In a release APK this lands in
   `adb logcat` (tag ReactNativeJS), so the CEO's next device run names the real cause if
   anything still stalls. Deliberately did NOT change retry semantics (offline durability
   preserved) or auto-fail network entries.

**Note:** `markSynced` still doesn't write the server's totals back to the local row, but
that's now moot — the parse-boundary fix means local totals are already correct before
sync.

**CEO on-device check:** reinstall the rebuilt APK clean (`adb uninstall com.llmagal.vita`
first), log a meal → hero/macros/timeline should show real kcal and the entry should flip
from "waiting to sync" to synced within a second. If any entry still stalls, capture
`adb logcat -s ReactNativeJS | grep outbox` and report the reason line.

---

## APP-058 — voice/audio log dead on device

### Root cause — PROVEN
`src/capture/speech.ts` hardcoded `active = stubRecognizer()` and **`setRecognizer` is
never called** anywhere in app code; **no STT library is a dependency** (grep: no
expo-speech-recognition / @react-native-voice). So on the standalone APK the mic runs the
demo stub, which streams a CANNED phrase ("Had a banana and a handful of peanuts around
4") word-by-word and logs a **fabricated meal regardless of what the user says** — the
"dead / doesn't work" report. RECORD_AUDIO **is** declared (`app.config.ts` android
permissions + iOS usage strings), so the manifest is fine; there's simply no engine.

### Fix (honest, no native dep, verifiable)
`getRecognizer()` now selects by runtime (mirrors `stubHealthReader` / the notifier stub):
- Expo Go / jest (`ExecutionEnvironment.StoreClient`) → streaming demo stub (voice UI stays
  walkable).
- Any real build → new `unavailableRecognizer()` (isAvailable=false). The existing state
  machine (`useVoiceCapture.holdStart`) then shows the calm "voice isn't available — Type
  instead" state instead of fabricating a log.

This stops the fabrication and points the user to typing. **It does not deliver real
voice** — that is a genuine feature build (a native STT module + config plugin + a CNG
rebuild + device verification, and a library-version choice this repo's "SDK 56" pins make
non-trivial). It drops in behind the same `setRecognizer` seam. **Flag for CEO:** decide
whether to build real STT now (needs a native dep + a rebuild you run on your Mac).

---

## APP-060 — PDF plan import fails

### Root cause — PROVEN, it's INFRASTRUCTURE (DevOps), not app code
Drove the real two-phase flow against prod:
- `POST /uploads` → **200**, returns a presigned S3 PUT URL (signs `content-type;host`).
- **S3 PUT → 403 AccessDenied:** `User: …assumed-role/vita-ecs-task/… is not authorized to
  perform: kms:GenerateDataKey on resource: arn:aws:kms:eu-west-1:201261380352:key/
  075c7c59-ebae-4806-a1a8-01e7671e29a8 because no identity-based policy allows the
  kms:GenerateDataKey action`.
- Because the object never lands, the follow-up `POST /parse/eating-plan {fileRef}` returns
  **422 "The fileRef is unknown or expired."**

The uploads bucket is SSE-KMS encrypted; the presigned PUT executes under the ECS task
role's temp creds, and that role lacks KMS encrypt permission on the bucket CMK. **The app
flow is correct.** → **Needs a DevOps ticket:** grant `vita-ecs-task` role
`kms:GenerateDataKey` (+ `kms:Encrypt`) on the uploads bucket CMK `075c7c59-…`.

### App-side (this batch): surface the real error
`putPresignedFile` (`client.ts`) now includes S3's error body in the thrown Error (was a
bare `status`); `importPlanPdf` (`onboarding/planImport.ts`) `console.warn`s the cause
before returning the calm `upload-error` outcome. Next device run's logcat names the exact
failure. UX stays calm.

---

## APP-059 — Samsung Health / Health Connect brings no data

### Verdict — wiring is CORRECT; symptom is silent-failure UX + device-only setup
`src/health/healthConnect.ts` correctly gates the real reader to Android non-Expo-Go,
lazy-requires `react-native-health-connect`, and the permission delegate is registered in
`plugins/withHealthConnect.js` (fixed session 9). The emulator has no HC data provider, so
real-data verification is CEO-only.

The real gap: the Integrations toggle fired `connectHealthConnect()` fire-and-forget,
ignoring the returned boolean → a denied permission / absent HC left the switch "on" with
**no feedback and no data** ("brings no data").

### Fix (`app/(main)/integrations.tsx`)
Toggle now awaits `connectHealthConnect()`: on failure it reverts the switch and toasts
actionable guidance (`integrations.healthConnectUnavailable`: "Health Connect isn't set up
on this phone. Install it, then in Samsung Health turn on sync to Health Connect."); on
success with an empty snapshot it toasts `healthConnectNoData`. Two i18n keys added.

### CEO on-device recipe (only a Samsung phone can prove this)
1. Install Health Connect (Play Store) if not present; open Samsung Health → Settings →
   Health Connect → enable syncing (steps, active energy, exercise).
2. In Vita → Account → Integrations, toggle **Health Connect** on → grant the read
   permissions in the system dialog.
3. Expect either data on the Energy card ("N steps · M workouts · from Health Connect"),
   or the "No data yet today" toast if Samsung Health hasn't synced. If the toggle bounces
   back with the "isn't set up" toast, HC/permission isn't available — the app is being
   honest, not broken.

---

## Files changed (worktree)
- `src/api/client.ts` — `fillDraftTotals` + wire into parse; PUT error body (APP-061/060)
- `src/api/__tests__/parse-photo.test.ts` — +3 fillDraftTotals regression tests
- `app/_layout.tsx` — boot drain after `loadSession` (APP-061)
- `src/db/outbox.ts` — instrument sync backoff (APP-061)
- `src/onboarding/planImport.ts` — log real upload error (APP-060)
- `src/capture/speech.ts` — `unavailableRecognizer` + runtime `getRecognizer` (APP-058)
- `src/__tests__/voice-capture.test.tsx` — +1 unavailableRecognizer test
- `app/(main)/integrations.tsx` — honest HC toggle w/ guidance (APP-059)
- `src/i18n/locales/en.json` — +2 HC guidance keys

## Dependencies on other teams
- **DevOps (new ticket):** grant `vita-ecs-task` IAM role `kms:GenerateDataKey`/`kms:Encrypt`
  on uploads bucket CMK `075c7c59-ebae-4806-a1a8-01e7671e29a8` (APP-060 blocker).

## Questions for the CEO
- **APP-058:** build real on-device STT now (native dep + APK rebuild), or ship the honest
  "type instead" fallback for this release?
