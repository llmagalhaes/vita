# ADR-0001 — Modular monolith: Kotlin + Spring Boot 4.0.x, flat packages

**Status:** Accepted — 2026-07-13

## Context

One mobile client, one small AI-driven team, a domain where everything joins against everything (timeline, trends). CEO directive: no onion/hexagonal architecture, keep it simple. Spring Boot 3.5 OSS support ended June 2026; Boot 4.0 (Spring Framework 7) went GA November 2025 and is mature.

## Decision

One deployable: `services/vita-api`, **Kotlin on Spring Boot 4.0.x, JDK 21 LTS**, single Gradle module, plain packages (`auth`, `users`, `log`, `plans`, `habits`, `health`, `ai`, `trends`, `export`, `crypto`, `shared`). Each package holds controller, service, repository, domain records — as few files as do the job. Data access via Spring Data JDBC (no JPA). No interfaces with one implementation, no mapper layers, no domain/application/infrastructure subfolders, no events between packages — a package calls another package's service directly.

## Consequences

- No microservices overhead; a future split (only plausible candidate: `ai`) is a deploy decision, not a rewrite.
- Boot 4 ecosystem risk surfaces in W0 (walking skeleton); fallback to a 3.5.x pin is a one-line version change with zero code migrated.
- Module boundaries are convention, not Gradle-enforced — acceptable until compile time or a real boundary violation hurts (see `kickoff-addendum.md` §2).
