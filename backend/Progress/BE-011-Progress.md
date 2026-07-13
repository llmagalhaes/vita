# BE-011 · log_entry model + POST /v1/entries with idempotency — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216523339228889
- **Status**: In progress — code complete + tested locally 2026-07-13; Done blocked on production deploy (BE-004).

## 2026-07-13 — implementation

New feature package in the CEO's controller → service → repository layering (Round 8 #0), first code to follow it:

- `entries/controller`: `EntryController` (POST `/v1/entries`, protected by the resource server) + wire DTOs `NewEntry` / `LogEntry` (`EntryDtos.kt`). `detail` stays a raw `JsonNode` on the wire; the service discriminates it by the sibling `type`.
- `entries/service`: `EntryService` + typed `EntryDetail.kt` views (meal/water/workout) + `EntryResult` (Created/Replay/Conflict).
- `entries/repository`: `EntryRepository` (JdbcTemplate) + `InsertData` / `StoredEntry` / `Denorm` row carriers.

Behaviour:
- **Idempotency-Key** (required header): `INSERT … ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING …`. Row returned → 201. No row → the key was used: compare the stored `request_hash` (SHA-256 of the canonical normalized request) — equal → **200** replay of the original entry; different → **409**. One race-safe path, no check-then-insert window.
- **Server recomputes meal totals** from items on write (client-sent `totals` ignored); the same recompute feeds the C2 denormalized columns (`kcal/protein_g/carbs_g/fat_g` for meals, `water_ml` for water, `duration_min`+`kcal` for workouts).
- **Server-set fields**: `source=user` (DB default), `logged_at`/`updated_at` (DB `now()`), `id` (DB `gen_random_uuid`) — all read back via `RETURNING`.
- **ADR-0003 classes**: `detail_enc` and `source_phrase_enc` are C3, encrypted with the per-user DEK via the existing `CryptoService` (AAD-bound to the user). Denormalized numbers stay plaintext C2 so trends can `GROUP BY`. A test asserts item names / source phrase are unreadable as raw bytes at rest.
- Validation → 400 (RFC 7807): empty meal, water amount out of 1–10000, blank workout title, or a detail that doesn't match its `type`.

**No new migration**: `log_entry` (with the idempotency, denormalized and C3 columns) was already defined in `V001__baseline.sql` — that IS the expand-only migration for this ticket. Nothing to add.

## Tests

`entries/EntryFlowTest` (Testcontainers, contract-shape assertions), 7 cases: create + server fields + totals recompute (9999→300), replay 200 same id, 409 on same-key/different-body, water + workout create, 400 validation, 401 unauth, C3-encrypted-at-rest. Full suite 35/35 green; `./gradlew check` green; redocly exit 0. Verified live in the local loop (compose → bootRun → magic-link → verify → create/replay/409 → /me).

## Remaining for Done

- Production deploy (BE-004). GET/PATCH/DELETE `/v1/entries` + timeline is BE-012 (depends on this).
