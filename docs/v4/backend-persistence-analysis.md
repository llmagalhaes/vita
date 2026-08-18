# Vita — device-local persistence inventory & backend-persistence proposal

**Session 22 addendum (2026-08-18), backend team lead.** Status: **analysis only — no code, no tickets filed, no git.**
Trigger: CEO directive *"muita coisa hoje está sendo persistida apenas no app, eu gostaria de persistir no backend"*.

Inputs read: `CLAUDE.md` · `docs/v4/PLAN.md` (R1–R10 decided) · `docs/v4/backend-plan.md` (§1.1, §2.4) ·
`docs/v4/app-plan.md` · `docs/contracts/vita-api-v0.yaml` v0.7.0 · ADR-0003 / ADR-0004 / ADR-0016 ·
the app's real persistence layer (`app/services/vita-app/src/db/*`, `src/health/healthConnect.ts`,
`src/auth/session.ts`, `src/energy/manual.ts`) — every `kv` key grepped across `src/`.

---

## 0 · Headline — the directive is half a storage question and half a *restore* question

The inventory turned up something bigger than the settings gap the CEO is pointing at.

**Today, a reinstall loses the entire log — even though the log is already fully persisted server-side, encrypted.**

`GET /entries` (with `date`/`from`/`to`/`type`/cursor paging) has existed since contract 0.4.0 and is live in
production. **The app never calls it.** The only call site of `api.listEntries` in the whole app is the
check-in 409 reconcile path (`src/db/outbox.ts:76`). Sync is strictly one-way: SQLite → outbox → server.
`src/db/entries.ts:236` even documents the assumption in a comment — *"the local SQLite is the display source
(entries are never re-fetched)"*.

So the honest state is:

| After `adb uninstall` + reinstall + sign in | Comes back? | Why |
|---|---|---|
| Meals, water, workouts, check-ins (the whole log) | **NO** | Persisted server-side, encrypted — but the app has no hydrate path |
| Eating plan / training program | YES | `syncPlan` / `syncProgram` on Home mount |
| Vacation ranges | YES | `syncVacation` on Home mount |
| Portion overlay | YES (kept — CEO Round-13 #2 overruled the retirement) | rides `GET /plan` |
| Name | NO (re-asked in onboarding) | `PATCH /me` is a write-only mirror; `GET /me` is never called |
| Habits, composition flags, notification prefs, recap hour | **NO** | never left the device |

**Consequence for the roadmap:** building `user_settings` (the CEO's literal ask) while the log itself still
dies with the phone would be fixing the small half. The two pieces of work are independent and both cheap;
the log-restore piece is the one that actually answers *"survive reinstall / phone loss"*.

Second finding, smaller but a genuine data-responsibility defect: **`DELETE /v1/entries/{id}` is specified in
the contract AND implemented in production** (`EntryController.kt:75`), but the app has no client method for it
— `deleteEntry()` deletes locally only, and its comment claiming *"there is no delete endpoint in the
contract"* is stale and wrong. A user who discards an already-synced entry leaves it on the server forever.
That contradicts "store strictly what is necessary", and it is a hard blocker for a correct restore (deleted
entries would resurrect on rehydrate).

---

## 1 · Full inventory

Four stores: SQLite `vita.db` (5 tables), the `kv` table inside it (20 keys), Expo SecureStore (1 record),
plus 2 items v4 proposes to add. **30 rows.** Sensitivity classes: **HD** = health data · **PP** = personal
preference · **UI** = pure UI mechanics · **RM** = re-syncable mirror of something already stored elsewhere.

### 1.1 SQLite tables (`src/db/db.ts`)

| # | Item | Example value | Class | Crypto | Recommendation | Effort |
|---|---|---|---|---|---|---|
| 1 | `entries` — the log (meal/water/workout/checkin) | `{type:"meal", occurredAt:"2026-08-18T12:30Z", detail:{title:"Almoço", items:[…], totals:{kcal:640}}}` | **HD** | Already C3 server-side (`log_entry.detail_enc`, per-user DEK, AAD `log_entry.detail`) | **Already persisted — build the RESTORE path** (§3). No new storage, no new endpoint. | app 0.5–1d |
| 2 | `outbox` | `{seq:41, entryId:"a3f…", op:"create", attempts:0}` | UI (mechanism) | — | **Device-only.** It is the *unsent* queue; uploading it is a category error. | — |
| 3 | `pending_parse` | `{kind:"photo", imageUri:"file:///cache/IMG_2.jpg", capturedAt:…}` | HD (raw) | — | **Device-only.** Transient (minutes), points at a local file URI that is meaningless off-device, and ADR-0003 forbids persisting photos server-side. | — |
| 4 | `habits` — definitions | `{name:"Tomar remédio", days:[t,t,t,t,t,f,f], time:"08:00", enabled:1, kind:"plan", planMealName:"Café da manhã"}` | **HD** (habit names are named C3 in ADR-0003) | **C3 encrypted blob** | **PERSIST BACKEND** — inside the `user_settings` blob (§4). Highest-value item after the log: hand-built schedules, real re-entry cost. | 0.25d BE + 0.25d app |
| 5 | `kv` (container) | — | — | — | see §1.2 | — |

### 1.2 `kv` keys — every one, grepped from `src/`

| # | Key | Example value | Class | Crypto | Recommendation | Effort |
|---|---|---|---|---|---|---|
| 6 | `settings.name` | `"Lucas"` | PP | C3 (already `users.name_enc`) | **Already persisted** — but `GET /me` is never called. Hydrate it on cold start (2 lines) so a restored device doesn't re-ask. | ~0 |
| 7 | `settings.keepTrack` → v4 `domains` | `{meals:true, water:true, move:true, habits:true, weight:false}` | PP (reveals *what* the user tracks — weight/cycle interest is a body-data signal) | **C3, in the blob** | **PERSIST BACKEND** (blob). Contradicts `PLAN.md` R5 / backend-plan Q1 default — this directive supersedes. | included in §4 |
| 8 | `settings.notificationsEnabled` | `true` | PP | C3, in the blob | **PERSIST BACKEND** (blob). Free once the blob exists. | included |
| 9 | `settings.notifRecap` | `true` | PP | C3, in the blob | **PERSIST BACKEND** (blob). | included |
| 10 | `settings.recapStartHour` | `20` | PP (daily-routine signal; v4 R7 makes it the day-close hour) | C3, in the blob | **PERSIST BACKEND** (blob). | included |
| 11 | `settings.integrations` | `{healthConnect:true}` | PP | C3, in the blob | **DEVICE-ONLY.** A toggle without the matching OS permission grant is a lie — restoring `true` onto a phone where Health Connect was never authorized would show "connected" with no data. Per-device by nature. | — |
| 12 | `onboarded` | `true` | UI | — | **DEVICE-ONLY.** Derivable anyway (a restored blob ⇒ onboarded). Onboarding is 2 steps in v4 and step 1 (name) hydrates from `/me`. | — |
| 13 | `seeded` | `true` | UI | — | **DEVICE-ONLY.** Mock/demo build only (`src/db/seed.ts`); never runs against prod. | — |
| 14 | `vacation.ranges` | `[{start:"2026-09-01", end:"2026-09-08"}]` | **HD** (absence pattern) | Already C3 (`vacation.ranges_enc`) | **Already persisted + already hydrated.** No change. | — |
| 15 | `vacation.keepCheckins` | `false` | PP | C3, in the blob | **PERSIST BACKEND** (blob). Currently the *only* part of the vacation config that doesn't survive. Two-line add. | included |
| 16 | `vacation.tripHabitIds` | `["8f2c…","1a0b…"]` | PP | C3, in the blob | **PERSIST BACKEND** (blob) — meaningless without #4, so it must ride the same blob to stay consistent. | included |
| 17 | `plan.current` | full `EatingPlanDraft` (5 meals, 42 items) | **HD** | Already C3 (`eating_plan.doc_enc`) | **Already persisted + hydrated.** No change. | — |
| 18 | `program.current` | full `TrainingProgramDraft` | **HD** | Already C3 (`training_program.doc_enc`) | **Already persisted + hydrated.** No change. | — |
| 19 | `plan.portions` | `{"it-7": 1.5}` | HD (portion actually eaten) | plaintext jsonb today (CEO A1) | **KEPT** (CEO Round-13 #2: BE-053/V011 do not run). Still: do **not** carry its plaintext-jsonb precedent into the new table. | — |
| 20 | `plan.portionsDate` | `"2026-08-18"` | UI | — | **DEVICE-ONLY.** Day-scoped gate; dies with the overlay. | — |
| 21 | `plan.meta` | `{source:"pdf", importedAt:"2026-07-23T…"}` | PP | C3, in the blob | **PERSIST BACKEND** (blob) — 2 fields, keeps the Eating-Plan source badge honest on a restored device (which otherwise shows a plan with no provenance). Its own code comment already names this as the ceiling. | included |
| 22 | `plan.setupPromptHidden` | `false` | UI | — | **DEVICE-ONLY.** One-time banner dismissal; re-showing it once after a reinstall is harmless (arguably correct). | — |
| 23 | `workout.daySkips` (+ `…Date`) | `{"Dia A":{"Supino":true}}` | HD (today-only) | — | **DEVICE-ONLY.** Explicitly ephemeral, resets at midnight (`src/db/plan.ts:164` — "never the outbox"). Nothing to restore. | — |
| 24 | `workout.selectedDay` | `"Dia B"` | UI | C3, in the blob (free) | **DEVICE-ONLY** (default) — a UI cursor. Ride the blob only if it costs literally nothing; not worth a line of its own. | — |
| 25 | `nav.swiped` | `true` | UI | — | **DEVICE-ONLY.** One-time swipe hint. The canonical "not worth persisting" case. | — |
| 26 | `int.promptDismissed` | `true` | UI | — | **DEVICE-ONLY.** Same. | — |
| 27 | `health.snapshot` | `{date:"2026-08-18", activeKcal:412, steps:7318, sessions:1, readAt:…}` | **HD** | — (today only) | **DEVICE-ONLY today (ADR-0016)** — but see §5, this is a genuine CEO decision. Note: it is a *single day* cache, stale-ignored. There is no HC history on the device at all. | see §5 |
| 28 | `*.dirty` flags (`vacation.dirty`, `plan.current.dirty`, `program.current.dirty`, `plan.portions.dirty`) | `true` | UI (mechanism) | — | **DEVICE-ONLY.** Per-device sync bookkeeping. | — |

### 1.3 SecureStore + v4-proposed additions

| # | Item | Example | Class | Crypto | Recommendation | Effort |
|---|---|---|---|---|---|---|
| 29 | Auth session (`src/auth/session.ts`, Keychain/Keystore) | `{accessToken, refreshToken, expiresAt}` | — (credential) | OS-backed | **DEVICE-ONLY — must never be persisted or restored.** Re-auth via magic link / Google / Apple is the correct recovery path. | — |
| 30 | `day_record` SQLite cache (v4, APP-094 per R1) | `{date:"2026-08-17", …}` | RM | — | **DEVICE-ONLY.** Derived from entries (R1); rebuilds itself once #1's restore lands. Persisting it would duplicate the log. | — |
| 31 | Weight readings from Health Connect (v4 R4) | `{kg:78.4, at:…}` | **HD** | — | **DEVICE-ONLY** per R4/ADR-0016. Manual weight already goes to the backend as a `weight` entry (BE-047). See §5 for the HC half. | see §5 |

*(31 rows; #5 is the `kv` container itself, so **30 distinct persisted items**.)*

---

## 2 · The split

| Bucket | Count | Items |
|---|---|---|
| **Already persisted server-side AND hydrated** — no work | 4 | plan doc, program doc, vacation ranges, portion overlay (retiring) |
| **Already persisted server-side, NOT hydrated** — restore path missing | 2 | **the log (`entries`)**, `name` |
| **Persist backend (new)** — one blob | 8 | habits, `domains`, notificationsEnabled, notifRecap, recapStartHour, vacation.keepCheckins, vacation.tripHabitIds, plan.meta |
| **Stay device-only** | 15 | outbox, pending_parse, integrations, onboarded, seeded, portionsDate, setupPromptHidden, daySkips(+Date), selectedDay, nav.swiped, int.promptDismissed, dirty flags, auth session, day_record cache, `health.snapshot`* |
| **CEO decision** | 1 | Health Connect data (*counted above as device-only, the current ADR-0016 posture) |

---

## 3 · Restore path for the log (the big half)

No new storage, no new endpoint, no migration. The server already holds it, encrypted, and already pages it.

**Shape (app side, ~1 builder-day):** after sign-in on a device whose `entries` table is empty, page
`GET /entries?from&to&limit&cursor` backwards from today and insert rows as `syncState:'synced'`,
`id = serverId = LogEntry.id`. Backfill window is the CEO's call (§10 Q4); 12 months at Vita's volume is a few
hundred rows. Run it once, gated on a `kv` flag, non-blocking (Home renders as it fills).

**Three sharp edges, all cheap:**

1. **Deleted entries would resurrect.** Fix the real bug: wire the existing `DELETE /v1/entries/{id}` into
   `deleteEntry()` (contract ✓, backend ✓, app client method missing entirely). One outbox `delete` op.
   Independently justified by data responsibility — today a discarded synced entry is kept forever.
2. **Id shape.** Restored plain entries key on the server uuid, not the original local uuid. Harmless — the
   local uuid's only job is the Idempotency-Key, which is spent. Check-ins keep working: their id is
   deterministic (`habitId:date`) and re-derivable. **Caveat:** if habits are *not* restored (§4), a restored
   check-in's `habitId` points at nothing — the entry still renders (the habit's name/kind ride inside
   `CheckinDetail`), but the dot strips can't group. One more reason habits and the log restore together.
3. **`needsReview` is local-only** and simply reads false after a restore. Correct: those entries were already
   reviewed, or the review moment is gone.

---

## 4 · Mechanism — one `user_settings` blob (recommended)

Exactly the §2.4 sketch, unchanged, because it is a verbatim copy-paste of the `vacation` trio that has been
live since V005 (`VacationRepository` 30 lines · `VacationService` 35 · `VacationController` 25).

```sql
-- V012__user_settings.sql   (expand-only)
CREATE TABLE user_settings (
    user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,  -- C1
    settings_enc bytea NOT NULL,        -- C3: per-user DEK, AAD 'user_settings.settings'
    updated_at   timestamptz NOT NULL DEFAULT now()                          -- C1
);
```

`AadContext.USER_SETTINGS = "user_settings.settings"` · `GET/PUT /v1/me/settings` · body is an opaque JSON
**object** (the only validation is `isObject`, exactly as vacation validates `isArray`) · replace-on-write,
last-write-wins, echoes what was stored · `ON DELETE CASCADE` + crypto-shred inherited for free (ADR-0004).

The blob the app puts:

```json
{ "domains": {"meals":true,"water":true,"move":true,"habits":true,"weight":false},
  "notificationsEnabled": true, "notifRecap": true, "recapStartHour": 20,
  "vacation": {"keepCheckins": false, "tripHabitIds": ["8f2c…"]},
  "planMeta": {"source":"pdf","importedAt":"2026-07-23T18:02:11Z"},
  "habits": [{"id":"8f2c…","name":"Tomar remédio","days":[true,true,true,true,true,false,false],
              "time":"08:00","enabled":true,"kind":"plan","planMealName":"Café da manhã",
              "createdAt":"2026-07-19T…"}] }
```

### 4.1 One opaque blob vs. habits as their own resource — decision

**Recommendation: one blob.** The four arguments for splitting habits out, evaluated honestly:

| Argument for a separate `/me/habits` resource | Verdict |
|---|---|
| **Multi-device conflict** — blob LWW loses a habit edited on device B while device A saves settings | Real, but Vita has **one device per user** (~5 users, the CEO's Samsung). YAGNI. Ceiling + flip path below. |
| **Size** | 50 habits ≈ 8 KB; whole blob well under 32 KB. API Gateway's cap is 10 MB. Non-issue — add a 64 KB `413` guard at the trust boundary and forget it. |
| **Server needs to read habits** (e.g. server-side reminders) | It does not, and must not: notifications are device-local by CEO decision (2026-07-13 #3). If server push ever ships, habits need a *readable* schema anyway — a different design, not this one. |
| **Blast radius of a corrupt blob** | Same either way; both are one encrypted row. A failed GCM tag loses both, and the log (the valuable part) is untouched in `log_entry`. |

Against splitting: a separate resource is a second table, a second migration, a second controller/service/
repository trio, a second sync path, per-habit dirty tracking, and delete tombstones — roughly 3× the code for
a conflict scenario that does not exist. `ponytail:` **one blob, LWW; if concurrent multi-device editing ever
becomes real, split `habits` out as its own resource keyed on the ids it already has** (`Habit.id` is a stable
uuid today, so the split is mechanical).

### 4.2 The one hazard that must be in the app ticket

**Hydrate before you push.** A fresh install whose local settings are empty must not `PUT` an empty blob and
wipe the server copy. Rule: on cold start, `GET /me/settings` first; only enable pushes after a `200` (adopt)
or a definitive `404` (nothing stored). Same dirty-flag discipline already used by `plan`/`vacation`
(`src/db/kv.ts` `isDirty`/`setDirty`/`clearDirty` — reuse it, do not invent a second mechanism).

### 4.3 Crypto stance

**C3 encrypted blob under the per-user DEK. No plaintext columns. No new crypto decision.**

Justification against the default posture ("anything reflecting health behavior or body data = encrypted"):
habit names are *named explicitly* in ADR-0003's C3 list ("habit names") and in practice read like a medical
record ("Tomar remédio", "Insulina", "Fisioterapia"); `domains.weight` / `domains.habits` disclose what the
user chose to track about their body; `recapStartHour` is a daily-routine signal and in v4 (R7) is the
day-close hour. Everything here is small, none of it is ever aggregated in SQL, so the C2 plaintext-column
rationale (ADR-0003: "encrypt the words, aggregate the numbers") does not apply — there are no numbers to
aggregate. Encryption is free: the envelope, the DEK cache, the AAD discipline and the crypto-shred already
exist. The **plaintext-jsonb precedent from `plan_portions` (CEO amendment A1) is deliberately not extended** —
that table stays (CEO Round-13 #2) but its precedent was a one-off amendment (A1), not a policy.

Notably nothing here needs to be server-*readable*, which is what makes the opaque blob honest rather than
lazy: the server genuinely cannot learn anything from it, matching the vacation precedent.

---

## 5 · Health Connect data — does the directive override ADR-0016?

**Recommendation: NO for now — but the honest reason is not the one in ADR-0016, and the CEO should hear it.**

Facts from the code, not from the ADR:

- Vita stores **one single-day snapshot** (`health.snapshot`: date, activeKcal, steps, sessions) and ignores
  it once stale (`healthActiveKcalToday`). **There is no HC history on the device.** Workout sessions are read
  **live** from HC on every render of the Workout hub (`useWorkoutHistory`, 30-day window) and never stored.
- So "persist HC data so it survives reinstall" is mis-stated: **there is nothing to lose today.** The real
  question is whether Vita should start *building* an HC history it does not currently keep — a new feature,
  not durability for an existing one.

Is HC data actually re-syncable after a reinstall? **Only partially, and less than ADR-0016 assumes.** Health
Connect restricts an app to reading roughly the last **30 days** of data preceding the moment permission was
granted; reading further back requires the separate historic-read permission (Android 15 / recent HC), which
Vita does not request. Retention beyond that is a user setting and the source app's business (Samsung Health
etc.), entirely outside Vita's control. So on a fresh install, HC realistically returns ~30 days of steps and
sessions and nothing older — regardless of what Vita does.

The tradeoff, stated crisply:

- **Keep device-local (ADR-0016 stands).** $0, zero new code, zero dedup logic, and it holds the strongest
  privacy line Vita has: *external sensor data never reaches Vita's servers.* Cost: activity older than ~30
  days is gone on a new phone, forever — and today it is gone anyway, since Vita keeps no history at all.
- **Upload daily HC snapshots** (the cheap version: one `health` day-summary entry per day, riding the
  existing entries path). Buys a permanent activity history that outlives both the phone and HC's own read
  window. Costs: a new entry type + migration; **dedup is the real work** — HC totals change as the day fills
  in and as the source app back-fills, so the same day must be re-written repeatedly (`Idempotency-Key:
  hc:<date>` + PATCH-on-change makes it tractable, ~0.5d BE + 0.5d app); and it crosses a privacy line the
  product has held since ADR-0016 and advertises in its philosophy.
- **Middle option, if the CEO wants history without the reversal:** keep HC out of the backend but store a
  daily *local* snapshot table on the device (today only one day exists). Gives 12-month trends now, still
  dies with the phone. ~0.25d app, $0, no ADR change.

**Default if the CEO says nothing: ADR-0016 stands, HC stays device-local.** This is genuinely his call — it
is a philosophy question, not an engineering one, and reversing it needs an ADR (ADR-0016 superseded).

Manual weight is *not* affected: it already goes to the backend as an encrypted `weight` entry (BE-047, R4).

---

## 6 · Not worth persisting — say it plainly

`nav.swiped` · `int.promptDismissed` · `plan.setupPromptHidden` (one-time hints — re-showing them once on a
new phone is arguably the *correct* behavior) · `seeded` (mock builds only) · `onboarded` (derivable) ·
`workout.daySkips` + `plan.portionsDate` (deliberately ephemeral, reset at midnight) · `*.dirty` (per-device
sync bookkeeping) · `outbox` (the *unsent* queue — uploading it is a category error) · `pending_parse` (points
at local file URIs; ADR-0003 forbids server-side photos) · `health.snapshot` (single-day cache) ·
`day_record` (derived from entries per R1) · the **auth session** (must never leave the Keystore).

---

## 7 · Contract diff sketch (folds into BE-047, v0.8.0 — still all-additive)

```yaml
  /me/settings:
    # Opaque encrypted durability for the device-local settings bundle (habits,
    # composition flags, notification prefs). Same posture as /me/vacations: the
    # server stores the object verbatim, never reads or interprets it.
    get:
      tags: [account]
      summary: Get the stored settings blob
      responses:
        "200":
          description: The blob as last written; `{}` if never set.
          content: { application/json: { schema: { type: object, additionalProperties: true } } }
        "401": { $ref: "#/components/responses/Unauthorized" }
        default: { $ref: "#/components/responses/Problem" }
    put:
      tags: [account]
      summary: Replace the stored settings blob
      description: >-
        Replace-on-write, last-write-wins: the whole object is re-encrypted and
        replaces the previous value. No merge, no server-side interpretation.
        Echoes what was stored. Clients MUST GET before their first PUT so a
        fresh install cannot overwrite the stored blob with an empty one.
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, additionalProperties: true } } }
      responses:
        "200": { description: The stored blob. content: { application/json: { schema: { type: object } } } }
        "400": { $ref: "#/components/responses/Problem" }   # not an object, or > 64 KB
        "401": { $ref: "#/components/responses/Unauthorized" }
        default: { $ref: "#/components/responses/Problem" }
```

No other contract change is needed: `GET /entries` (from/to/type/cursor), `GET /me`, `GET /entries/{id}` and
`DELETE /entries/{id}` all already exist at v0.7.0 and are live. The description text of `GET /entries` should
gain one sentence acknowledging its new role as the reinstall-restore read (documentation only).

---

## 8 · Ticket & effort deltas against `PLAN.md` §3

**Changed:**

- **BE-047 (contract v0.8.0 + ADR-0019)** gains: the `/me/settings` block above; one sentence on `GET /entries`
  as the restore read. **+0.25d** (0.5d → 0.75d).
- **`PLAN.md` R5 is amended**: composition flags, habit definitions/schedules and the notification switches move
  from "device-local, no backend work" to "device-local *behaviour*, backend-persisted *durability*". Trends
  aggregates, HC data and export stay device-local unchanged. **§5 Q9's default flips** (see §10 Q1).
- **APP-094** (day record) — unchanged; the `day_record` cache stays derived (R1 holds).
- **APP-095** (composition flags / `src/db/domains.ts`) gains the blob's read/write side and the
  hydrate-before-push rule (§4.2). **+0.25 builder-session.**
- **APP-103** (habits) gains: habit CRUD marks the blob dirty and enqueues one coalesced `settings` outbox op —
  **reuse the `portions` coalescing pattern verbatim** (`src/db/plan.ts:123`), do not invent a second one.
  **+0.25 builder-session.**

**New:**

| Ticket | What | Effort |
|---|---|---|
| **BE-056** | `user_settings` table (V012, expand-only) + `GET/PUT /v1/me/settings` + `AadContext.USER_SETTINGS` — copy of the vacation trio; tests: round-trip, opaque-blob preservation, non-object 400, >64 KB 400, C3-unreadable-as-text fixture, cross-user isolation | **0.5d** |
| **APP-110** | Settings-blob sync: `src/db/settings.ts` + `habits.ts` + `vacation.ts` local prefs → one blob; coalesced outbox op; `syncSettings()` on Home mount alongside `syncPlan`/`syncProgram`/`syncVacation`; hydrate-before-push guard | **1 builder-session** |
| **APP-111** | **Log restore** (§3): one-shot backwards paging of `GET /entries` into SQLite on an empty device + `GET /me` name hydrate | **1 builder-session** |
| **APP-112** | **Wire `DELETE /entries/{id}`** into `deleteEntry()` via an outbox `delete` op; fix the stale comment at `src/db/entries.ts:236`. Blocks APP-111 (resurrection) and closes a data-responsibility gap on its own | **0.25 builder-session** |
| **BE-057** *(only if CEO reverses ADR-0016)* | HC daily snapshots as a `health` entry type + migration + `hc:<date>` idempotency/PATCH dedup + superseding ADR | **0.5d** (+0.5 app) |

**Migration numbering:** V010 (weight type) and V011 (reserved; unused now that the portions overlay stays per CEO Round-13 #2) are already claimed by
the v4 round → this is **V012**, expand-only, rides the same OPS-025 deploy. No extra deploy round.

**Net delta:** backend **+0.75d** (≈3.25d → ≈4d) · app **+2.75 builder-sessions** (≈18 → ≈20.75). Still inside
the "3–4 build sessions + 1 deploy session" envelope in `PLAN.md` §2 — the two new app tickets are independent
of every wave and can ride wave 3 or 4 in parallel.

## 9 · Cost impact — **~$0**

One table with one small row per user (~2–8 KB encrypted), on the existing free-tier RDS instance. Two
endpoints on the running ECS task; no new AWS resource, no new IAM, no new KMS key (the per-user DEK and the
`vita-app-data` CMK already exist). KMS calls are unchanged in shape and covered by the 15-minute DEK cache.
The log restore is bounded reads against data already stored. **No devops ticket, nothing for the devops
board.** Consistent with the CEO's "cheapest possible" answers.

---

## 10 · CEO decisions (defaults in italics — silence accepts them)

1. **Habits + composition flags + notification prefs persist server-side as one opaque encrypted blob?**
   *Default: **yes** — this is the directive, and it reverses `PLAN.md` §5 Q9 and backend-plan Q1, whose
   defaults were "device-local".* Cost: BE-056 (0.5d) + APP-110 (1 session), ~$0.
2. **Restore the log on reinstall (APP-111)?** *Default: **yes**.* This is the part that actually makes "survive
   phone loss" true; the data is already on the server, only the read path is missing. Without it, #1 restores
   your habits onto an empty log.
3. **Wire the existing `DELETE /entries/{id}` (APP-112)?** *Default: **yes**.* Today, discarding a synced entry
   leaves it on the server forever — contrary to "store strictly what is necessary" — and it would resurrect
   under #2.
4. **How far back does the restore reach?** *Default: **12 months**, one-shot, in the background.* Alternatives:
   90 days (faster first paint) or everything.
5. **Health Connect data — reverse ADR-0016 and upload it?** *Default: **no**, ADR-0016 stands (§5).* Note the
   honest correction: Vita keeps no HC history today, so nothing is currently being lost; and HC only lets a
   reinstalled app read back ~30 days regardless. If you want activity history without crossing the privacy
   line, take the middle option in §5 (device-local daily snapshots, ~0.25 session, $0).
6. **One blob vs. habits as their own resource?** *Default: **one blob**, LWW (§4.1).* Say so if you expect two
   devices editing the same account concurrently in the next few months — that is the only fact that changes
   the answer.
7. **Integrations toggle (`healthConnect: true`) — restore it?** *Default: **no** (§1.2 #11)* — restoring a
   toggle without the OS permission grant would display "connected" with no data.

---

## 11 · Questions for the CEO (beyond the decision list)

- **Is "persist in the backend" also meant to enable a second device** (tablet, new phone *alongside* the old
  one), or strictly reinstall/loss recovery? Everything above is designed for recovery — LWW, no merge. Real
  concurrent multi-device changes the blob answer (§4.1) and would want tombstones on entries.
- **Does the log restore need to be visible** (an explicit "Restoring your log…" state on first open) or silent
  in the background? Vita's philosophy argues for honest and visible; the app plan has no such surface yet.
- `docs/v4/meal-plan.pdf` is still uncommitted pending anonymization (`PLAN.md` §5 housekeeping) — unchanged by
  this analysis, still open.
