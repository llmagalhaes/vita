# ADR-0019 — Contract v0.8.0: v4 day record, weight entry, settings blob, plan-aware capture

**Status:** Accepted — 2026-08-18 (V4 round; BE-047)

## Context

The CEO approved the V4 plan (`docs/v4/PLAN.md`, reconciled from
`docs/v4/app-plan.md` · `backend-plan.md` · `devops-plan.md`) and the backend
persistence analysis (`docs/v4/backend-persistence-analysis.md`, all seven
defaults confirmed). Decisions are logged in `docs/ceo-decisions.md` Rounds 13
and 14.

v4 is a structural rethink of the **app**, not of the backend. The one
genuinely new domain concept — the **day record** ("did you have this meal,
as planned, adjusted, or not at all?") — maps onto log entries that already
exist. Everything else v4 adds is either already shipped (habits/check-ins,
vacation, plan editing, per-exercise muscles, async PDF import) or belongs on
the device (trends aggregation, Health Connect, export, notification
scheduling).

Two forcing facts shaped this round:

1. **The reconciliation (PLAN.md R1) rejected a `/days` resource.** The app
   plan asked for `GET /days?from&to` + `GET/PUT /days/{date}`. Day status is
   derivable from the records themselves, so a day resource would be a second
   source of truth needing reconciliation with the first.
2. **The persistence inventory found a bigger gap than the one the CEO
   pointed at.** `GET /entries` has existed since 0.4.0 and is live, but the
   app has never called it for display — so a reinstall lost the entire log
   even though the server held it, encrypted, the whole time. The CEO's ask
   ("persist the device-local settings") is real, but the log restore is the
   half that actually makes "survive phone loss" true.

## Decision

Contract bumps **0.7.0 → 0.8.0, fully additive**. No field removed, no type
narrowed, no status code changed. Old clients ignore every new field.

1. **Day status is DERIVED, never stored.** A meal/workout record on a day ⇒
   the day is recorded; all records `done` ⇒ "as planned"; any `adjusted` or
   `skipped` ⇒ "adjusted"; no record ⇒ "unrecorded" (water alone does not
   close a day). No `day_record` table, no `/days` endpoints, no migration.
   `planned` is **not a wire value at all** — a plan meal with no record is by
   definition unrecorded, and storing it would be storing an absence.
   Consequence for the app: the local `day_record` SQLite table is a derived
   cache, and the outbox drains ordinary entry ops (no `dayRecord` op shape).

2. **Close-the-day and retro-close are ONE representation.** Both write the
   same per-meal/per-workout records; they differ only in `occurred_at` (the
   day being recorded) versus `logged_at` (now, already on every row). The
   honesty caption the prototype wants ("closed later, by you") is derived
   from `logged_at` > the recorded day's end. **No `closedAt` / `closedBy` /
   `closed {at, mode}` field.** The prototype's `Reopen` is local UI state —
   it never deletes records. The prototype's two disjoint shapes (per-meal
   statuses + a boolean vs. a single day-offset key) are deliberately NOT
   ported; the app builds to this reconciled model.

3. **Plan linkage rides the existing encrypted detail.** `MealDetail` gains
   `planMealId` / `planStatus` (`done|adjusted|skipped`) / `planOptionIndex`;
   `MealItem` gains `replacesItemId`; `WorkoutDetail` gains `planDay` /
   `planStatus`. `MealDetail.items` relaxes `minItems` 1 → 0, allowed **only**
   when `planStatus == "skipped"` (a skipped meal is a real record with zero
   totals) — anything else is a 400, as is `planStatus`/`planOptionIndex`
   without `planMealId`. The server does **not** validate `planMealId` against
   the current plan: plans are versioned and a retro record may legitimately
   outlive the version it points at.

4. **Records are self-describing; stale back-pointers are accepted.** A record
   carries its own `title`, `items` and `totals`, so past days render
   correctly after a plan re-import; only the "which plan meal was this"
   linkage goes stale and nothing reads it for past days. No plan-version
   pinning. No `m-N` backfill (CEO A2 / Round 13 #6: the CEO re-imports the
   plan once after the v4 deploy).

5. **`PlanMeal` gains a stable `id` (`m-1`…`m-N`)** — same rules and same
   `PlanService.decorate()` mechanism as `PlanItem.id` (`it-N`): assigned at
   save, round-tripped unchanged on PUT, `m-(max+1)` for new meals, duplicates
   are a 400, absent on parse responses, no backfill.

6. **Weight: manual → backend, Health Connect → device-local.** New `weight`
   entry type (migration **V010**, expand-only CHECK widening, mirroring V006)
   + `WeightDetail{kg}`, metric-only (20..500), encrypted in the entry detail
   like every other type, denormalizing to all-null (trends are client-side,
   so nothing would read a `weight_kg` column). **ADR-0016 stands** (CEO Round
   14 #5): Health-Connect readings are a re-syncable mirror of an external
   source and never reach the server. The Trends weight line therefore mixes
   two sources by design — the backend copy is deliberately partial and nobody
   should later "fix" it by backfilling HC weights into `/entries`.
   Idempotency is the app's choice (`weight:<date>` recommended); the server
   imposes none.

7. **Composition flags, habit definitions and notification prefs move to the
   backend as ONE opaque encrypted blob** — `user_settings` (migration
   **V012**, expand-only) + `GET/PUT /v1/me/settings`, a copy of the vacation
   trio: replace-on-write, last-write-wins, no merge, the only validation is
   "is a JSON object" plus a ~64 KB cap at the trust boundary. **This reverses
   the earlier device-local default** (PLAN.md R5, backend-plan Q1) per CEO
   Round 14 #1. Crypto: **C3**, per-user DEK, AAD `user_settings.settings`,
   `ON DELETE CASCADE` + crypto-shred inherited for free (ADR-0003/0004). The
   plaintext-jsonb precedent from `plan_portions` (amendment A1) is **not**
   extended — A1 was a one-off, not a policy. Habit names are named explicitly
   in ADR-0003's C3 list and in practice read like a medical record.
   One blob, not a `/me/habits` resource: scope is **recovery-only, one device
   at a time** (CEO Round 14 #8), so the multi-device conflict that would
   justify a second table does not exist. `ponytail:` if concurrent
   multi-device editing ever becomes real, split `habits` out as its own
   resource keyed on the stable uuids it already carries.
   **Client rule, load-bearing:** hydrate before push — a fresh install must
   `GET` first (and adopt, or observe `{}`) before it is allowed to `PUT`,
   or an empty local state overwrites the stored blob.

8. **`GET /entries` gains a second role: the restore read.** No API change —
   the app pages it backwards on a device with an empty local log (12-month
   window, background, **silent**, CEO Round 14 #4/#9). Two app-side
   prerequisites are named here because they are correctness, not polish:
   the existing `DELETE /v1/entries/{id}` must finally be wired client-side
   (today a discarded synced entry lives on the server forever — contrary to
   "store strictly what is necessary" — and would resurrect on restore), and
   restored plain entries key on the server uuid (harmless: the local uuid's
   only job was the spent Idempotency-Key; check-in ids stay derivable from
   `habitId:date`). The integrations toggle is deliberately NOT restored — a
   toggle without the matching OS permission grant would lie.

9. **Plan-aware capture reuses the existing parse endpoints.** No new
   endpoint, no new response schema, no `ParseResult.planDelta`. When the user
   has a current plan the server injects a compact digest (meal
   `{id,name,time}` → items `{id,name,quantity,unit,kcalPerUnit}`) into the
   prompt and extends the `record_log_entries` tool schema with exactly the
   §3 fields. **Swap lists are excluded from the digest** (up to 26 per item ×
   42 items would dominate the context for no gain — the model names the
   replacement food and the app matches it against the swap list it already
   holds). A matched meal returns the **full resulting composition**, every
   item tagged with `replacesItemId`, `planStatus` = `done` when nothing
   differs else `adjusted`. No plan or no match → 0.7.0 behaviour verbatim;
   the 422 branch is unchanged. **The kcal delta is never on the wire** — the
   app holds both the plan item and the recorded item and subtracts. Cost:
   ~1.5–3k extra input tokens per capture, CEO-approved (Round 13 #9),
   bounded by the existing per-user daily parse quota (BE-014) and queryable
   through the `ParseMetrics` INFO cost line.

10. **The portions overlay STAYS.** `plan_portions` (V008) and
    `PUT /plan/portions` were recommended for deletion (backend-plan §1.2,
    PLAN.md R3) because the v4 day record absorbs the day-scoped use and the
    modal's "only counts for today" copy never matched a plan-version-scoped
    table. **CEO Round 13 #2 overruled it** — "the app may still need it".
    BE-053 and V011 do not run; V011 is a burnt migration number. This keeps
    0.8.0 additive, which is a real side benefit: the app can adopt it
    immediately with no coordinated cutover.

11. **New public `GET /privacy`** (BE-055) — static HTML, no auth, served
    under the same `/v1` base path as every other public route
    (`<publicBaseUrl>/v1/privacy`), exactly the `/v1/auth/link` pattern from
    BE-035. No domain is being bought (CEO Round 13, cheapest option); if one
    is bought later the URL changes and this route stays as the origin. The
    policy **text** is a CEO/product deliverable, not a backend one.

**Storage note:** every new field except `weight`'s type value and
`user_settings` lands inside blobs that are already AES-256-GCM under the
per-user DEK, already AAD-bound to `userId:table.column`, already
crypto-shredded on account deletion. **No new crypto decision.** Migrations
this round: V010 (weight type, expand-only), V011 **unused/burnt**, V012
(`user_settings`, expand-only). Both ride the same deploy.

## Consequences

- **Blocks the app team.** Every v4 app ticket touching the day record, weight,
  settings durability or log restore is blocked on 0.8.0 landing; the
  orchestrator relays it immediately (ADR-0006). App types regenerate from this
  file — `npm run api:check` in `app/services/vita-app` fails until they do,
  which is expected app-side work, not a contract defect.
- Implementation lands in **BE-048** (day-record fields + write-path
  validation), **BE-049** (`weight` + V010), **BE-050** (`PlanMeal.id` in
  `decorate()`), **BE-051** (plan-aware capture: digest, tool schema, WireMock
  goldens, one `@Tag("live")` eval against the real `meal-plan.pdf` plan),
  **BE-055** (`/privacy`), **BE-056** (`user_settings` + `/me/settings`),
  shipped by **BE-052** via a Terraform `app_image_tag` apply (the OPS-024
  pattern — no CLI task-def clones).
- Two rules binding on every client, flagged because they are easy to miss:
  (a) any path summing `MealDetail.items` must tolerate an empty array and an
  all-zero `totals`; (b) close-the-day and retro-close are the same write.
- redocly lint: **valid, exit 0** — 45 warnings vs 40 on 0.7.0, the +5 being
  the same pre-existing cosmetic classes (3 × missing `operationId` for the
  three new operations, 1 × `tag-description` for the new `public` tag,
  1 × `operation-4xx-response` on `/privacy`).
- Ceilings carried forward: positional `it-N`/`m-N` identity is weak under
  heavy reordering by old clients (accepted pre-launch, ADR-0017/0018);
  settings LWW loses one side under true concurrent multi-device editing
  (accepted — recovery-only scope, upgrade path in decision 7).
