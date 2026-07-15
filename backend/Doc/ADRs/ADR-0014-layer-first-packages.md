# ADR-0014 — Package layout: layer-first (controller/service/repository over feature)

**Status:** Accepted — 2026-07-15 (CEO decision, BE-028; **supersedes ADR-0012**)

## Context

ADR-0012 chose **feature→layer** packages (`entries/controller`, `entries/service`,
`entries/repository`, …). For BE-028 (pre-release hygiene sweep) the CEO reversed this to
**layer→feature**: a conventional Spring layout where a file's *role* is the top-level
package and the *feature* is the sub-package. This is a deliberate CEO call — not
re-litigated here; this ADR records it.

The reorg also exposed a dependency-direction smell that feature-first hid: services
imported their controller's DTOs (e.g. `ParseService` → `ai.controller.Draft`). Under
layer-first that is a service→controller (upward) dependency. The fix is a shared `model`
layer that both controller and service depend on.

## Decision

Top-level packages under `com.llmagal.vita`:

| Package | Holds |
|---|---|
| `controller/<feature>` | `@RestController`s + `@RestControllerAdvice` + shared response helpers |
| `service/<feature>` | domain services, their collaborators, outbound adapters, and the seams |
| `repository/<feature>` | Spring Data JDBC access + row/param records |
| `model/<feature>` | request/response DTOs and typed records shared across layers |
| `model` (root) | cross-feature shapes (`MacroTotals`, `Micro`) |
| `config` | `@Configuration` / `@ConfigurationProperties` (`SecurityConfig`, `AuthProps`, `AiConfig`, `AwsClientsConfig`) |

- **Crypto** lives under `service/crypto`: `CryptoService`, the `AesGcm` primitive, the
  `KeyWrapper` seam (+ `LocalKeyWrapper`) and `KmsKeyWrapper`. Cohesive; not split across a
  `utils` bucket.
- **`ClaudeClient`** (outbound Claude adapter) and the S3/KMS adapters sit in their feature's
  `service/` package next to the seam they implement — no separate `client/`/`adapter/` layer.
- **Health** endpoint → `controller/health` (was the `shared/` bucket, now removed).

### Deliberately NOT created (ponytail — no empty packages)

The CEO's sketch listed `utils` and `exceptions` as example buckets. Neither has real
cross-feature content, so neither exists:

- No `utils` — `AesGcm` is the only stateless primitive and it belongs with crypto.
- No `exceptions` — the one custom exception (`UnknownFileRefException`) stays with its
  `FileStore` seam.

Inventing them would violate the anti-empty-package rule ADR-0012 already stated and the
ponytail directive. Add them the day a second genuine occupant appears.

### Test packages unchanged

Integration/flow tests stay **feature-grouped** (`test/.../entries/EntryFlowTest`). A flow
test spans all three layers, so a layer-first test tree makes no sense. Tests only had
their imports updated to the new main FQNs.

## Load-bearing seams kept (ponytail exception)

`KeyWrapper`, `FileStore`, `Mailer` are single-implementation interfaces that exist so the
`aws` profile can swap local↔AWS beans. They are deliberate and were **not** collapsed.

## AAD defense-in-depth (audit 1.7, folded into BE-028)

`CryptoService.encryptForUser/decryptForUser` now take a `context: String` and bind the
GCM AAD to **`"$userId:$context"`** where context is the `table.column` (see `AadContext`),
instead of just the userId. A ciphertext can no longer be replayed into another user *or*
another column — a wrong context fails the GCM tag. Contexts are centralized in `AadContext`
so encrypt/decrypt sites (sometimes in different services) cannot drift; plan/program docs
derive theirs from the table name.

**Breaking for existing local dev rows:** the AAD is part of every C3 blob, so rows written
before this change no longer decrypt. Acceptable — there is no production data and the local
DB is throwaway (drop the volume / re-seed). New AAD binding is covered by
`CryptoServiceTest` ("ciphertext is bound to its context").

## Consequences

- One conventional layout; a file's home is obvious from its role, then its feature.
- Correct dependency direction: controller → model ← service; service → repository.
- Removed a genuine duplication (`MacroTotals`/`Micro` were declared twice).
- Pure move + import rewrite; no endpoint, contract, or migration change. `./gradlew check`
  green throughout (123 tests; +1 AAD test), 6 LocalStack adapter tests green.
