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
| `VITA_MASTER_KEY` | committed dev key | Wraps per-user DEKs (LocalKeyWrapper; prod = KMS CMK) |
| `VITA_SERVICE_DEK` | committed dev key | Encrypts account-boundary fields (email) |
| `VITA_HMAC_KEY` | committed dev key | Email blind index |
| `VITA_JWT_SECRET` | committed dev key | HS256 access-token signing |
| `VITA_MAGIC_LINK_BASE_URL` | `vita://auth` | Prefix of the magic-link URL |

The committed defaults protect throwaway local data only; production overrides all of
them from Secrets Manager / KMS (devops).

## Auth in local dev

There is no SES yet: the magic-link email is faked by `LogMailer`, which prints the
link to the app log. Flow:

```bash
curl -X POST localhost:8080/v1/auth/magic-link -H 'Content-Type: application/json' \
  -d '{"email":"you@local.dev"}'                       # 202; link appears in the bootRun log
curl -X POST localhost:8080/v1/auth/magic-link/verify -H 'Content-Type: application/json' \
  -d '{"token":"<token from the logged link>"}'        # -> {accessToken, refreshToken, expiresIn}
```
