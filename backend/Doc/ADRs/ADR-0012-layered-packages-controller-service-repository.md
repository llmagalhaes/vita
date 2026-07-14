# ADR-0012 — Package layout: controller / service / repository per feature package

**Status:** Accepted — 2026-07-14 (supersedes the package-layout section of ADR-0001)

## Context

ADR-0001 chose a modular monolith with **flat** feature packages (`auth`, `crypto`,
`log`, …), each holding controller + service + repository + records side by side.
From BE-011 onward the CEO (Round 8) mandated a light internal layering: within each
feature package, split by role into `controller/`, `service/` and `repository/`
sub-packages. Newer packages (`entries`, `users`, `account`, `jobs`, `ai`, `uploads`)
were built that way; the older ones (`auth`, `crypto`, `shared`) stayed flat. BE-016
brings them into line.

## Decision

Each feature package keeps its files in role sub-packages:

- `controller/` — `@RestController`s and their request/response DTOs.
- `service/` — domain services, their collaborators (mailer, rate limiter) and the
  data records they return.
- `repository/` — Spring Data JDBC access.

**Config / props / pure utilities that have no controller/service/repository role stay
at the feature-package root**, matching the existing `ai/AiConfig.kt` precedent. Do not
invent an empty layer or a fake `support/` package just to avoid a root-level file —
that is the over-abstraction ADR-0001 and the ponytail rule forbid.

This is convention only; Spring's component scan and `@ConfigurationPropertiesScan` are
rooted at `com.llmagal.vita` and recurse, so moving a bean into a sub-package changes
nothing about wiring. No Gradle-enforced boundaries (unchanged from ADR-0001).

## What moved in BE-016

- `auth/AuthController` → `auth/controller/`
- `auth/{MagicLinkService, TokenService, Mailer, RateLimiter}` → `auth/service/`
- `crypto/CryptoService` → `crypto/service/`
- `shared/HealthController` → `shared/controller/`

Mechanical only: package declarations + imports fixed, zero behaviour change, endpoints
and contract untouched. 84 tests stayed green throughout.

## Judgment calls — deliberately kept at the package root

- **`auth/SecurityConfig.kt`** (`@Configuration`, Spring Security filter chain) and
  **`auth/AuthProps.kt`** (`@ConfigurationProperties`). Config, not a
  controller/service/repository — same rung as `ai/AiConfig.kt`. Moving `SecurityConfig`
  in particular is pure risk (bean wiring) for zero readability gain.
- **`crypto/AesGcm.kt`** — a stateless `object` of AES-GCM primitives. A pure utility,
  not a service.
- **`crypto/KeyWrapper.kt`** — the KMS SPI seam (interface + `LocalKeyWrapper`, Dek
  record). It is the crypto module's port to AWS KMS, not an application service; kept at
  the root alongside the primitive it wraps. `CryptoService` (the actual domain service)
  moved to `crypto/service/`.
- **`shared/`** stays a cross-cutting bucket; only its one controller went to
  `shared/controller/`.

## Consequences

- All feature packages now read the same way; a new file's home is obvious from its role.
- No functional change, no migration, no contract change.
- Future packages follow this layout; genuinely role-less files (config/props/util) sit
  at the package root — that is the rule, not an exception.
