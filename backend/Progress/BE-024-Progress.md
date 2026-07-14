# BE-024 — `checkin` as a new entry type

Asana: Vita backend board (project `1216519867368580`). Slice 4 (F6 Habits & check-ins).
ADR: `Doc/ADRs/ADR-0013`. Contract v0.4.0 (additive, no bump — D6).

## Done (local)

Check-ins ride the existing `entries/` path — no new domain, no new table. The
whole detail is the C3 per-user-DEK blob like every other entry; check-ins carry
no aggregatable numbers, so `denormalize` returns all-null.

- **`EntryType`** (`entries/controller/EntryDtos.kt`) gained `checkin`; `NewEntry.type`
  contract enum widened to `[meal, water, workout, checkin]`.
- **`CheckinDetail`** (`entries/service/EntryDetail.kt`) = `{habitId, habitName, kind,
  answer, note?}`, tolerant reader. `EntryService.normalize` validates the four
  required fields are non-blank then stores verbatim (server-opaque — no
  interpretation of `kind`/`answer`); `denormalize` → `Denorm(all null)`.
- **Idempotency = `habitId:date`** via the existing `Idempotency-Key` header path:
  same answer replays (200), a different answer with the same key is 409.
  **Change-answer = PATCH** the entry (type immutable → re-validated as `checkin`,
  whole blob re-encrypted). No new server logic — reuses BE-011/BE-012.
- **Home/Habits split** is the existing BE-017 CSV `type` filter: Home
  `type=meal,water,workout` excludes check-ins, Habits `type=checkin` selects them.
  `checkin` was already forward-compat in the filter allow-list; now a real type,
  so the redundant `+ "checkin"` literal was removed.
- **Migration `V006__log_entry_checkin_type.sql`** — widens the `log_entry.type`
  CHECK to include `checkin` (expand-only; `input_method` already permitted it).
- **Contract**: `CheckinDetail` schema + added to `EntryDetail` oneOf; `Idempotency-Key`
  param loosened (dropped `format: uuid`, documents the deterministic `habitId:date`
  key). redocly exit 0.

## Tests (`entries/CheckinFlowTest.kt`)

create → idempotent replay → 409 on different answer → PATCH change-answer;
Home excludes / Habits includes; missing answer → 400; detail encrypted at rest.
Also fixed a latent nondeterminism in `EntryFlowTest` (`SELECT kcal … LIMIT 1`
scoped to `type='meal'`, since the shared test DB now holds null-kcal check-ins).

`./gradlew check` green — 122 tests, detekt/ktlint clean, redocly exit 0.

## App consumes (slice 4)

POST `/v1/entries` with `type=checkin`, `Idempotency-Key: <habitId>:<date>`,
detail = `CheckinDetail`. Change the answer by PATCHing the returned entry id.
Read via `GET /v1/entries?type=checkin`.
