# BE-055 + BE-056 — Progress

Session 22 (v4 build round). One builder, both tickets. Contract v0.8.0 is the truth.

## BE-056 — `GET/PUT /v1/me/settings` (opaque encrypted settings blob)

Near copy of the `/me/vacations` trio (BE-025), which is exactly what the contract
asks for ("same posture as /me/vacations").

| File | What |
|---|---|
| `src/main/resources/db/migration/V012__user_settings.sql` | `user_settings(user_id PK → users ON DELETE CASCADE, settings_enc bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`. Expand-only. V011 skipped (burnt). |
| `repository/users/SettingsRepository.kt` | `find` / `upsert` (ON CONFLICT DO UPDATE). Blob-only, never sees plaintext. |
| `service/users/SettingsService.kt` | C3 encrypt/decrypt under the per-user DEK, `AadContext.USER_SETTINGS`. Validation = is-object + 64 KB cap. Replace-on-write. |
| `controller/users/SettingsController.kt` | `@RestController /v1/me/settings`, raw `JsonNode` in/out. |
| `service/crypto/CryptoService.kt` | +1 line: `const val USER_SETTINGS = "user_settings.settings"` in `AadContext`. |

Decisions:
- **AAD** = `user_settings.settings`, i.e. the same `table.column` convention every
  other C3 column uses (`AadContext`, hardened in session 7 to `userId:table.column`
  inside `CryptoService` — the constant carries only the `table.column` half, like
  `vacation.ranges`).
- **Empty state** = `{}` (contract: "`{}` if the user has never written one"), built
  with `mapper.createObjectNode()` — mirrors vacation's empty array.
- **Oversize → 400**, not 413. The contract says "larger → 400" and documents the cap
  under the 400 response; followed literally. Cap is measured on the *serialized*
  bytes (`writeValueAsBytes`), checked before encrypting, so nothing oversize is ever
  stored.
- **Server never interprets the contents.** No schema, no keys read, no logging of the
  body. Last-write-wins, no merge (CEO Round 14 #8, recovery-only scope).
- **Crypto-shredding: nothing to add.** `AccountDeletionService` does `crypto.shred()`
  (drops the DEK → the blob is instantly unreadable) then `hardDelete()` =
  `DELETE FROM users`, and the new FK is `ON DELETE CASCADE` — so the row goes with it.
  There is no per-table deletion sweep to extend; the cascade *is* the sweep, exactly
  as for `vacation` / `log_entry` / `eating_plan`.

## BE-055 — public `GET /v1/privacy`

| File | What |
|---|---|
| `controller/PrivacyController.kt` | ~20 lines. Reads `privacy.html` from the classpath once at construction, returns it as `text/html`. |
| `src/main/resources/privacy.html` | The page. Self-contained (inline `<style>`, no assets, no JS). |
| `config/SecurityConfig.kt` | +`"/v1/privacy"` to the existing `permitAll` matcher list — same registration as `/v1/auth/**` (BE-035). |

Content is **v0, marked as a draft on the page itself** (a visible "Draft (v0) …
wording pending final review" banner) — but every claim in it is drawn from what the
system actually does: per-user AES-256-GCM + crypto-shred on deletion with the 7-day
grace window (ADR-0003 / ADR-0004), Health Connect data device-local and never
uploaded (ADR-0016), 30-day expiry on uploaded photos/documents, Claude API used for
interpretation, on-device voice transcription (APP-069), export + delete from the
account screen. Contact section deliberately points at "the address on the store
listing" rather than hardcoding a personal email on a public page — CEO copy decides.

## Gates (scoped — orchestrator gates the merged tree)

```
./gradlew test --tests 'com.llmagal.vita.users.SettingsFlowTest' \
               --tests 'com.llmagal.vita.PrivacyPageTest'     → BUILD SUCCESSFUL (7 + 1, 0 failures)
./gradlew detekt ktlintCheck                                   → BUILD SUCCESSFUL
```

Test delta: **+8** (`SettingsFlowTest` 7, `PrivacyPageTest` 1).

`SettingsFlowTest`: empty-`{}` before first write · round-trip + echo · last-write-wins
(dropped key really gone) · non-object 400 (array *and* scalar) · oversize 400 + not
stored · encrypted at rest (raw `settings_enc` does not contain the plaintext) +
cross-user isolation · 401 unauthenticated.
`PrivacyPageTest`: 200 `text/html` with no bearer token, body contains the app name and
a real section.

## Deviations / notes

- One detekt `MagicNumber` hit on `MAX_BYTES / 1024` inside the error string → message
  now says "64 KB" literally.
- `ktlintFormat` reformatted a method chain in the new test file; no logic change.
- Did not touch `service/ai` or any parse code (concurrent builder owns it).
- No git run.
