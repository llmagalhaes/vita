# vita-api

Vita's backend: Kotlin + Spring Boot 4, single Gradle module, flat packages (ADR-0001).
PostgreSQL 16 + Flyway (ADR-0002). Requires JDK 21 and Docker (for Postgres and Testcontainers).

## Run locally

```bash
cd backend/services/vita-api
docker compose up -d          # local Postgres 16 on :5432 (db/user/pass: vita/vita/vita)
./gradlew bootRun             # starts on :8080, Flyway migrations run at startup
curl localhost:8080/health    # {"status":"up"}
```

## Test and lint

```bash
./gradlew test     # unit + integration (Testcontainers spins its own Postgres — compose not needed)
./gradlew check    # test + ktlint + detekt
./gradlew ktlintFormat   # auto-fix formatting
```

## Migrations

Flyway scripts in `src/main/resources/db/migration/`, `V<NNN>__<name>.sql`, run at startup.
Rules (ADR-0002/0003):

- **Expand/contract only** — there is a single prod environment and no downtime window:
  add the new column/table first (expand), migrate readers/writers, drop the old one in a
  later migration (contract). Never rename/drop in the same release that stops writing.
- Every migration states the **data class (C1/C2/C3)** of each new column in a comment
  (ADR-0003); C3 columns are always encrypted `bytea`.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/vita` | JDBC URL |
| `DB_USERNAME` | `vita` | DB user |
| `DB_PASSWORD` | `vita` | DB password |
