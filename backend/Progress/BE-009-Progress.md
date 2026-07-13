# BE-009 · Profile: GET/PATCH /v1/me — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216521830738482
- **Status**: In progress — code complete + tested locally 2026-07-13; Done blocked on production deploy (BE-004).

## 2026-07-13 — implementation

Replaced the BE-006-era `MeController` stub with a real profile feature in the controller → service → repository layering (Round 8 #0):

- `users/controller/MeController`: GET + PATCH `/v1/me`, subject taken from the bearer JWT (`@AuthenticationPrincipal Jwt`), protected by the resource server.
- `users/service/UserService`: assembles the contract `User` — decrypts `name` (per-user DEK) and `email` (service DEK) via `CryptoService`; PATCH validates `name` (1–100) and `units` (`metric`/`imperial`) and requires ≥1 field (contract `minProperties: 1`) → 400 otherwise. `deletionEffectiveAt` = `deletion_requested_at + 7d`, present only during the grace window (`@JsonInclude(NON_NULL)`), so it's absent normally.
- `users/repository/UserRepository`: `findById` + targeted `updateName` / `updateUnits`.

No schema change — `users` already carries `name_enc`/`email_enc`/`units`/`deletion_requested_at` from `V001__baseline.sql`. Email lookup keeps using the existing HMAC blind index (unchanged here; it's the auth read path). Units stay plaintext C1; display conversion is the app's job (stored values stay metric).

## Tests

`users/MeFlowTest` (Testcontainers), 5 cases: decrypted profile (email round-trips, placeholder name from local-part, units metric, no `deletionEffectiveAt`), PATCH name+units, 400 on empty/bad-units/over-long-name, `deletionEffectiveAt` exposed during grace, 401 unauth. `AuthFlowTest`'s "resource server accepts our JWT on /v1/me" now hits the real 200. Full suite 35/35 green; `./gradlew check` green. Verified live in the local loop (GET then PATCH name+units).

## Remaining for Done

- Production deploy (BE-004).
