# BE-025 — Vacation ranges (`GET/PUT /v1/me/vacations`)

Asana: Vita backend board (project `1216519867368580`). Slice 7 (F10 Vacation mode).
ADR: `Doc/ADRs/ADR-0013`. Contract v0.4.0 (additive, no bump — D6).

## Done (local)

Durability for the device-local vacation config (D1): an encrypted opaque blob,
replace-on-write, one row per user. The server never reads or interprets the
dates — same "opaque blob" treatment as plan docs, minus versioning.

- **Migration `V005__vacations.sql`** — `vacation (user_id PK → users ON DELETE
  CASCADE, ranges_enc bytea, updated_at)`. `ranges_enc` is C3 (per-user DEK). The
  cascade + crypto-shred make it unreadable-then-gone on account deletion (ADR-0004).
- **`users/repository/VacationRepository.kt`** — blob-only; `find` + `upsert`
  (`INSERT … ON CONFLICT (user_id) DO UPDATE`, replace-on-write).
- **`users/service/VacationService.kt`** — `get` decrypts (empty array default),
  `replace` encrypts `writeValueAsBytes(array)` under the per-user DEK. Only check
  is a trust-boundary structural one: payload must be a JSON array → else 400. Does
  not parse the dates.
- **`users/controller/VacationController.kt`** — `@RequestMapping("/v1/me/vacations")`,
  GET/PUT taking a raw `JsonNode` (stored verbatim).
- **Contract**: `/me/vacations` GET/PUT (tag `account`) + `VacationRange` schema
  (`{start, end}` dates). redocly exit 0.

## Tests (`users/VacationFlowTest.kt`)

empty-array default; PUT-replace (not append) round-trip; non-array → 400;
ranges encrypted at rest; unauthenticated → 401.

`./gradlew check` green — 122 tests, detekt/ktlint clean, redocly exit 0.

## App consumes (slice 7 / APP-030)

`PUT /v1/me/vacations` with a JSON array of `{start, end}` (dates); `GET` reads it
back (`[]` if never set). Opaque durability — the device drives all vacation UX.
