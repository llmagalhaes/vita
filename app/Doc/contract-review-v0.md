# App review of `docs/contracts/vita-api-v0.yaml` (APP-001)

- **Date**: 2026-07-13 · **Reviewer**: app team · **Verdict**: approve with the answers below. No blocking changes; two small contract edits requested (points 6 and 5).
- Asana: APP-001 (task 1216514543214496). Goes to backend via the orchestrator.

## The 7 TBD-APP-REVIEW points

### 1. `/auth/oidc` — Apple `name` passed by the app on first sign-in
**Confirmed, keep as specified.** `expo-apple-authentication` returns `fullName` only on the first authorization; the app concatenates given + family name and sends it in `name`. Caveats backend must handle: the field can be absent even on first sign-in (user may edit/clear it, or the app may crash between authorization and the POST — Apple never returns it again). When `name` is absent on account creation, derive a placeholder from the email local-part; the user sets their name in onboarding step 1 anyway (`PATCH /me`). No contract change needed since `name` is already optional.

### 2. `GET /entries` — flat list, app groups by day
**Confirmed, flat list wins.** The timeline is one virtualized list with day headers; client-side grouping by `occurredAt` in the device timezone is a trivial reduce, and server-side day buckets would bake a timezone into the response shape. Keep as is.

### 3. `?updatedSince=` delta sync
**Not wanted in v0 — do not add it.** v1 reality is single user, single device: every local mutation goes through our own outbox, so the app already knows its own writes. Refresh strategy is fetch-by-day (Today + any day the user views); a full backfill runs on install/sign-in. Deletes need no tombstones: when a fetched day omits an entry we have marked as synced, it was deleted server-side and we drop it locally. Revisit (with tombstones) only if multi-device becomes real — noted as a v2 candidate, not v0.

### 4. `/parse/photo` — multipart + downscale target
**Multipart confirmed.** RN `fetch` + `FormData` handles multipart file upload natively; no base64 anywhere. Client-side downscale target agreed: **longest edge 1568 px, JPEG quality 0.8** (via expo-image-manipulator) before upload — typically 150–400 KB, far under the 5 MB cap. The 5 MB limit stays as a server-side backstop.

### 5. `ParseResult.drafts` — multiple confirmation cards
**App supports stacked confirmation cards — keep the array, do NOT cap at 1.** The prototype already has a stacked-card interaction (check-in stack); the confirmation flow reuses it: cards confirmed/adjusted/discarded one by one. Requested contract edit: add **`maxItems: 5`** to `drafts` so the UI stack is bounded; the model should merge or drop beyond that.

### 6. `WorkoutDetail.muscles` — closed vocabulary
**Yes — make it an enum.** The body-map silhouettes support exactly these 11 values; requested contract edit, lower_snake exactly as listed:

`chest, back, shoulders, biceps, triceps, forearms, core, glutes, quads, hamstrings, calves`

Backend maps model output onto this list and drops anything unmappable. If the model insists on finer grain (e.g. "lats", "traps") map to `back`; "abs"/"obliques" → `core`.

### 7. `Micro.name` — free-form vs enum
**Free-form confirmed.** The meal-detail micronutrient rows render name + amount + `percentDaily` as text/bars — no per-micro icons in the design, so no mapping table is needed. The app displays whatever comes, verbatim. Keep `percentDaily` optional (rows without it render without the reference bar).

## Offline outbox check (what the app's sync needs from v0)

All present — nothing missing for v0:

- `Idempotency-Key` on `POST /entries` with 200-replay and 409-on-body-mismatch: exactly what the outbox needs for safe retries. ✓
- `updatedAt` on `LogEntry` for reconciliation. ✓
- `PATCH /entries/{id}` replaces the whole `detail`: naturally idempotent on outbox replay; last-write-wins is acceptable (ADR'd single-device reality). ✓
- `DELETE` returns 204 on already-deleted: replay-safe. ✓
- `Retry-After` on 429: the sync worker honors it. ✓
- `/auth/refresh` single-use rotation: the app serializes refresh calls (one in-flight refresh, queued requests wait) to avoid family revocation on races. App-side concern, no contract change.

## Notes for later contracts (not v0 blockers)

- Plans, habits, trends aggregates, export, health ingestion are out of v0 scope as expected; the app builds waves 0–2 against this contract alone.
- Magic-link deep link: email link → https redirect → `vita://auth?token=…`; app POSTs the token to `/auth/magic-link/verify`. Matches `app/Doc/foundations.md`. ✓

## Questions for the CEO

None from this review.

## Backend ack — 2026-07-13

Both requested edits applied in `docs/contracts/vita-api-v0.yaml` v0.2.0
(backend ADR-0010): `WorkoutDetail.muscles` is the 11-value enum as listed,
`ParseResult.drafts` capped at `maxItems: 5`. `?updatedSince=` left out per
point 3. Resolved TBD-APP-REVIEW markers replaced with this review's answers.
redocly lint green. Point 1 caveat (Apple `name` absent → placeholder from
email local-part) is implemented in account creation. — team-lead-backend
