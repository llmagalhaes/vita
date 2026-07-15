# BE-028 · Backend hygiene sweep (pre-release gate)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216553558733508
Status: In progress (done locally; "Done" = in production per DoD — ships with F-LAST).
ADR: `Doc/ADRs/ADR-0014-layer-first-packages.md` (supersedes ADR-0012).
Session: Phase 2, 2026-07-15. Ran on Opus.

## Scope (CEO instructions)

Layer-first package reorg · ponytail deletions · comment hygiene · README + Mermaid ·
code-smell fixes · fold in Audit-2 1.7 (AAD table binding). No contract/endpoint change,
no new dependencies.

## 1. Package reorg — feature→layer becomes layer→feature (ADR-0014)

`git mv`-style moves only (package decls + imports rewritten; zero logic change). 51 main
files moved via a one-shot transform, then compiler-driven import fixes.

| Before (ADR-0012) | After (ADR-0014) |
|---|---|
| `<feature>/controller/*` | `controller/<feature>/*` |
| `<feature>/service/*` | `service/<feature>/*` |
| `<feature>/repository/*` | `repository/<feature>/*` |
| DTOs/records beside controllers & services | `model/<feature>/*` (+ `model/` root for shared shapes) |
| `auth/{AuthProps,SecurityConfig}`, `aws/*`, `ai/AiConfig` | `config/*` |
| `crypto/{AesGcm,KeyWrapper,KmsKeyWrapper}` + `crypto/service/CryptoService` | `service/crypto/*` |
| `ai/client/ClaudeClient` | `service/ai/ClaudeClient` |
| `shared/controller/HealthController` | `controller/health/HealthController` |

- `model/` breaks the service→controller import direction the reorg exposed (e.g.
  `ParseService` no longer imports `controller.Draft`).
- **NOT created:** `utils/`, `exceptions/` — no genuine cross-feature occupant (anti-empty-
  package rule). `AesGcm` stays with crypto; `UnknownFileRefException` stays with `FileStore`.
- Test packages left feature-grouped (flow tests span layers); imports only updated.
- Load-bearing seams `KeyWrapper` / `FileStore` / `Mailer` kept intact.

## 2. Ponytail wins (deletion/consolidation)

- **Removed duplication:** `MacroTotals` + `Micro` were declared twice (`PlanDtos` and
  `EntryDetail`). One shared `model/Nutrition.kt`; both features import it.
- **ClaudeClient:** deleted `extractToolOutput` — it was `extractTyped(_, ToolOutput)`
  verbatim. Two call sites now use the generic `extractTyped`. ~11 lines gone.
- Comments were already clean (prior sessions curated them); no TODO/FIXME/chatter found,
  so no manufactured churn.

## 3. Audit-2 1.7 — AAD binds table.column (defense-in-depth)

`CryptoService.encryptForUser/decryptForUser` gained a `context: String`; AAD is now
`"$userId:$context"` (was `userId` only). Context = `table.column`, centralized in the new
`AadContext` object so encrypt/decrypt sites can't drift. Plan/program docs derive theirs
from `PlanTable.table`. A ciphertext can no longer be replayed across users **or** columns.

**Breaks existing local dev rows** (AAD is part of the blob) — acceptable, no prod data,
local DB is throwaway. Covered by new test `CryptoServiceTest."ciphertext is bound to its
context"` (wrong context → GCM tag fails).

## 4. Docs

- `services/vita-api/README.md`: layer-first intro + 3 Mermaid diagrams (package overview,
  write-path request flow controller→service→crypto→repository, crypto envelope with per-user
  DEK / blind index / crypto-shred / AAD context).
- ADR-0014 written; supersedes ADR-0012.

## Results

- `./gradlew check` — **BUILD SUCCESSFUL, 123 tests, 0 failures** (was 122; +1 AAD test),
  detekt + ktlint clean.
- `./gradlew localstackTest` (LocalStack up) — **6/6 green, 0 skipped** (S3 + KMS adapters),
  containers torn down (`down -v`).
- Contract `docs/contracts/vita-api-v0.yaml` untouched (no endpoint/behaviour change).

## Deliberately NOT done

- **Jackson 2 → 3 convergence in ClaudeClient** (build.gradle-tracked debt). It's a real
  mini-migration across Jackson-2/3 API differences (`asInt(default)`, exception types,
  `treeToValue`) with WireMock-golden-response risk — not a shortest-diff-green change. The
  dual mapper is deliberately isolated and documented; left as tracked debt.
- Did not touch the `LongParameterList` / `TooManyFunctions` suppressions — each is a
  contract-shaped DTO or a cohesive read+write path; splitting would add classes, not remove
  them.
