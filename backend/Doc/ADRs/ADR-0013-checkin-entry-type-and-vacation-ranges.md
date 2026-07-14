# ADR-0013 — Check-in as an entry type + vacation ranges (contract 0.4.0, additive)

**Status:** Accepted — 2026-07-14 (backlog "Vita 100% local" D1/D6; BE-024, BE-025)

## Context

Two device-local features need durable, encrypted server storage without the
server ever interpreting the data (D1):

- **F6 Habits & check-ins** — habit *definitions*, days and notification prefs
  stay on the device; only the check-in *results* persist. "A single yes or no
  per check-in — no streaks, no scores."
- **F10 Vacation mode** — the vacation *config* is device-driven; only the
  resulting date *ranges* persist, as durability for the device.

Both must be encrypted at rest under the per-user DEK (ADR-0003), swept by the
account-deletion cascade + crypto-shred (ADR-0004), and add nothing the server
aggregates or reads. Contract stays on the single 0.4.0 bump (D6), additive.

## Decision

### Check-ins ride the existing entries path (no new domain/table) — BE-024

- A new entry `type = checkin` with detail `CheckinDetail = {habitId, habitName,
  kind, answer, note?}`. It is created, read, edited and deleted through the same
  `entries/` controller→service→repository as every other entry, so it inherits
  the C3 per-user-DEK envelope, idempotency, PATCH-replace and the ownership 404s
  for free. `denormalize` returns all-null (check-ins carry no aggregatable
  numbers); `normalize` validates the fields are present, then stores verbatim
  (server-opaque — no interpretation of `kind`/`answer`).
- **Idempotency = `habitId:date`** as the `Idempotency-Key`: one check-in per
  habit per day. Repeating the same answer replays (200); a *different* answer
  with the same key is a 409 — the create path never silently overwrites.
- **Change-answer = PATCH** the existing entry (type is immutable; the new detail
  is validated against `checkin` and the whole blob re-encrypted).
- The Home/Habits split is the existing CSV `type` filter (BE-017): Home sends
  `type=meal,water,workout` (excludes check-ins), Habits sends `type=checkin`.
  `checkin` was already forward-compat in the filter allow-list; it is now a real
  `EntryType`, so the redundant literal was removed.
- The `Idempotency-Key` contract param dropped `format: uuid` (loosened, backward
  compatible) since check-in keys are deterministic, not UUIDs.

### Vacation ranges = one encrypted opaque blob per user — BE-025

- **`GET/PUT /v1/me/vacations`**: a JSON array of `{start, end}` dates, stored as
  one AES-256-GCM blob under the per-user DEK, **replace-on-write** (single row,
  upsert). The server never reads or interprets the dates — same "opaque blob"
  treatment as plan docs, minus versioning. GET defaults to `[]`.
- The only server-side check is a trust-boundary structural one (the payload must
  be a JSON array → else 400); it does not parse the dates.
- New table `vacation (user_id PK → users ON DELETE CASCADE, ranges_enc, updated_at)`
  in migration `V005__vacations.sql`. Expand-only (ADR-0002).

## Consequences

- No new domain, table or job for check-ins; one migration (`V005`) for
  vacations. Both are unreadable-then-gone on account deletion via the existing
  cascade + crypto-shred, no extra wiring.
- Trends never see check-ins or vacation ranges as numbers — consistent with the
  "encrypt the words, aggregate the numbers" rule (ADR-0003) and the no-scores
  product philosophy.
- Cross-team contract change (ADR-0006): the orchestrator relays the 0.4.0
  additions (`checkin` type + `CheckinDetail`, `/me/vacations` + `VacationRange`)
  to the app team for slices 4 and 7.
