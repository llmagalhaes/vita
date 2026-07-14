# BE-016 · Reorganize packages: controller → service → repository

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216528330234155
Status: In progress (mechanical refactor done locally; "Done" = in production per DoD).
ADR: `Doc/ADRs/ADR-0012-layered-packages-controller-service-repository.md` (supersedes ADR-0001's package section).

## Goal

Bring the last flat packages (`auth`, `crypto`, `shared`) into the same
controller/service/repository layering the newer packages already use (Round 8 CEO
mandate). Pure mechanical move — no behaviour, endpoint or contract change.

## What moved

| From | To |
|---|---|
| `auth/AuthController.kt` | `auth/controller/AuthController.kt` |
| `auth/MagicLinkService.kt` | `auth/service/MagicLinkService.kt` |
| `auth/TokenService.kt` | `auth/service/TokenService.kt` |
| `auth/Mailer.kt` | `auth/service/Mailer.kt` |
| `auth/RateLimiter.kt` | `auth/service/RateLimiter.kt` |
| `crypto/CryptoService.kt` | `crypto/service/CryptoService.kt` |
| `shared/HealthController.kt` | `shared/controller/HealthController.kt` |

Package declarations + imports fixed accordingly. Cross-package import updates:
- Main: `entries/service/EntryService.kt`, `users/service/UserService.kt`,
  `account/service/AccountDeletionService.kt` (crypto import).
- Tests: `TestUser.kt`, `EntryFlowTest.kt`, `TimelineFlowTest.kt`, `MeFlowTest.kt`,
  `AccountFlowTest.kt` (auth + crypto imports); `CryptoServiceTest.kt` and
  `AuthFlowTest.kt` gained same-package-lost imports (`crypto.service.CryptoService`,
  `auth.service.Mailer`).

## Judgment calls — deliberately kept flat (at package root)

Following the existing `ai/AiConfig.kt` precedent (config/util lives at the package
root, not in a fake layer):

- `auth/SecurityConfig.kt` — `@Configuration` / Spring Security chain. Config, not a
  controller/service. Also the highest-risk bean to move for zero gain.
- `auth/AuthProps.kt` — `@ConfigurationProperties`. Config.
- `crypto/AesGcm.kt` — stateless AES-GCM primitive `object`. Utility.
- `crypto/KeyWrapper.kt` — the KMS SPI seam (interface + `LocalKeyWrapper` + `Dek`). A
  port, kept next to the primitive it wraps. Only `CryptoService` (the domain service)
  moved.

Nothing was left flat due to risk — every planned move succeeded. Component scan and
`@ConfigurationPropertiesScan` are rooted at `com.llmagal.vita` and recurse, so the moves
touched no wiring.

## Results

- `./gradlew check` — **BUILD SUCCESSFUL, 84 tests** (unchanged from before).
- `detekt` + `ktlintCheck` — clean, no new suppressions needed.
- redocly lint `docs/contracts/vita-api-v0.yaml` — valid, exit 0 (contract untouched;
  25 pre-existing warnings).
