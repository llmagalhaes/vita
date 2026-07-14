# BE-027 — Real KMS `KeyWrapper` (DEK envelope, LocalStack-tested)

Asana: Vita backend board (`1216519867368580`). Backlog: `docs/backlog-local-100.md` slice 8 + D9.
Status: **Done (local)** — 2026-07-14. Security-critical. No AWS applied, no git (orchestrator commits).

## What it does

Real KMS-backed `KeyWrapper` behind the **existing seam** (same `KeyWrapper` interface + `Dek`
type; nothing else changes). This is the real security value of the envelope scheme (ADR-0003):

- `generateDek()` → `kms.GenerateDataKey(keyId=alias/vita-app-data, AES_256)`. KMS returns the DEK
  in plaintext **and** wrapped (encrypted under the CMK). Only the wrapped blob is stored
  (`user_keys.wrapped_dek`); the plaintext lives in memory for the request / DEK-cache TTL, never
  persisted — identical lifecycle to `LocalKeyWrapper`.
- `unwrap(wrapped)` → `kms.Decrypt(ciphertextBlob)`. KMS reads which CMK from the blob metadata, so
  no key id is needed on decrypt.

The plaintext DEK is a raw 256-bit key `CryptoService` hands straight to AES-256-GCM — this bean
only changes *how the DEK is wrapped*, so it composes with the existing crypto unchanged.

Opt-in via the `aws` profile; default context keeps `LocalKeyWrapper`. `./gradlew check` never
touches KMS (D9).

## Files

- `src/main/kotlin/com/llmagal/vita/crypto/KmsKeyWrapper.kt` (new) — `@Profile("aws")` bean; alias
  resolution (`alias/vita-app-data`) so the underlying key id can rotate per LocalStack boot.
- `src/main/kotlin/com/llmagal/vita/crypto/KeyWrapper.kt` — `LocalKeyWrapper` now `@Profile("!aws")` (default).
- `src/main/kotlin/com/llmagal/vita/aws/AwsClientsConfig.kt` — shared `KmsClient` bean (see BE-026).
- `src/main/resources/application.yaml` — `vita.crypto.kms-key-alias` (default `alias/vita-app-data`).
- `src/test/kotlin/com/llmagal/vita/crypto/KmsKeyWrapperLocalStackTest.kt` (new) — `@Tag("localstack")`.

## Config key

| Key | Default | Purpose |
|---|---|---|
| `vita.crypto.kms-key-alias` | `alias/vita-app-data` | CMK the envelope wraps DEKs under; resolved by alias |

(plus `vita.aws.region` / `vita.aws.endpoint-override`, shared — see BE-026.)

## How the KMS envelope was verified

`./gradlew localstackTest` against LocalStack KMS — 3/3 green:

1. **`generateDek` returns a 256-bit plaintext DEK and a wrapped blob that is not the plaintext** —
   `plaintext.size == AesGcm.KEY_BYTES` (32), `wrapped != plaintext`, and `wrapped.size > 32`
   (KMS ciphertext carries CMK metadata → strictly larger than the raw key). Confirms the stored
   blob is genuinely wrapped, not the key in the clear.
2. **`unwrap` round-trips the plaintext DEK** — `unwrap(dek.wrapped) == dek.plaintext`.
3. **Composes with `CryptoService`'s crypto path** — encrypt a real entry string with
   `AesGcm.encrypt(dek.plaintext, …)` (exactly what `CryptoService.encryptForUser` does), then
   decrypt it with the DEK recovered via `unwrap(dek.wrapped)`. Round-trips to the original
   plaintext → a KMS-unwrapped DEK still decrypts an entry.

## Verification (2026-07-14)

- **Default `./gradlew check` (no docker/LocalStack): green, 122 tests, 0 failures**, AWS-free
  (LocalStack suites excluded by tag; `aws` profile off → no `KmsClient` constructed).
- **`./gradlew localstackTest` with LocalStack up: 3/3 green** (0 skipped — LocalStack reachable).

## Notes / skipped (ponytail)

- Symmetric AES-256 CMK → `Decrypt` needs no key id (blob carries it); alias only used on generate.
- Did NOT stand up full `CryptoService` + Testcontainers Postgres for the composition proof — the
  seam is `KeyWrapper` → raw DEK bytes → `AesGcm`; exercising `AesGcm` with the KMS DEK is the exact
  code path `CryptoService` runs, no DB needed. Add the DB-backed variant only if the wiring ever
  changes.
- Prod flip = `aws` profile + real CMK alias; endpoint-override blank → real KMS (devops provisions
  the CMK `vita-app-data` + IAM).
