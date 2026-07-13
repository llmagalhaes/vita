# BE-012 · Timeline list + entry get/update/delete — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216523338949597
- **Status**: In progress — code complete + tested locally 2026-07-13; Done blocked on production deploy (BE-004).

## 2026-07-13 — implementation

Read path + per-entry mutations, same `entries/{controller,service,repository}` package as BE-011, reusing its `normalize`/`denormalize`/`toLogEntry`. **No contract change** — all four endpoints were already specced in v0.3.0; **no migration** — reuses the `log_entry_user_timeline` index `(user_id, occurred_at DESC)` from `V001__baseline.sql`.

### GET /v1/entries (timeline)
- Newest first: `ORDER BY occurred_at DESC, id DESC` (id is the stable tiebreaker for equal timestamps).
- **Day filter**: `date` + `tz` (IANA) → half-open `[startOfDay, startOfNextDay)` instant range in that zone (`ZoneId.of` → `atStartOfDay(zone)`). `tz` **required** when `date` present → 400 otherwise; unknown zone → 400.
- **Cursor pagination**: opaque base64url of `"<occurredAt instant>|<id>"`; keyset predicate `(occurred_at, id) < (?, ?)` (row-value comparison, index-friendly). Fetch `limit+1` to decide `nextCursor`; absent on the last page. `limit` default 50, clamped 1–100. Invalid cursor → 400.
- Per-user scoped (`WHERE user_id = ?`); a user only ever sees their own log.

### GET /v1/entries/{id}
- `findByIdForUser` — another user's row (or a missing id) reads as absent → **404** (contract: "does not exist or belongs to another user"). No ownership leak.

### PATCH /v1/entries/{id}
- Body `{occurredAt?, detail?}`, at least one (empty → 400). `type` is **immutable** (not accepted in the body).
- `detail` present → **whole-detail replace**, validated/normalized against the *stored* type (mismatched shape → 400), re-encrypted (C3 per-user DEK) and the C2 denormalized columns re-extracted. `occurredAt`-only edit keeps the detail + denorm untouched.
- `updated_at` bumped to `now()` on every change. Foreign/missing entry → 404.

### DELETE /v1/entries/{id}
- Hard delete scoped to the owner; **idempotent 204** (deleting a missing or foreign entry is a harmless no-op — a foreign entry survives for its real owner, asserted in a test).

## Tests

`entries/TimelineFlowTest` (Testcontainers, contract-shape assertions), 13 cases: list ordering, day+tz filtering (timezone-boundary entry), date-without-tz 400, cursor paging with no overlap/duplication, get + foreign-404 + missing-404, patch occurredAt (detail preserved, updatedAt bumped), patch whole-detail replace + meal-total recompute (1→300) + C2 kcal followed, patch type-mismatch 400, empty-patch 400, patch-foreign 404, delete idempotent 204 + gone-after, delete-foreign leaves the owner's row, unauth list 401.

**Full suite 48/48 green** (was 35; +13). `./gradlew check` green (ktlint + detekt); redocly exit 0.

detekt notes for next time: `TooManyFunctions` (>11) fired on `EntryService` now holding the whole read+write path → `@Suppress("TooManyFunctions")` with reason; `SpreadOperator` on the dynamic-WHERE `jdbc.query(sql, mapper, *args)` → `@Suppress`. Kotlin backtick test names can't contain `;`.

## BE-004 prep — arm64 Dockerfile (part of this session, not BE-012)

Wrote `services/vita-api/Dockerfile` (+ `.dockerignore`) so OPS-014 has an image to push. Multi-stage, **linux/arm64** (Graviton, devops cost-revision §1.5):
- Build stage `--platform=$BUILDPLATFORM eclipse-temurin:21-jdk` — arch-neutral (JVM bytecode is portable), compiles on the host arch with **no QEMU emulation**, `--mount=type=cache` on the Gradle home, `bootJar -x test`.
- Runtime stage `eclipse-temurin:21-jre` (slim), non-root `vita` user, `EXPOSE 8080`, `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=75.0` (container-aware; 21 has `UseContainerSupport` on by default), `ENTRYPOINT ["java","-jar","app.jar"]`.
- **HEALTHCHECK hits `/health`, not `/actuator/health`** — there is no actuator dependency and the existing `HealthController` `/health` already does a DB liveness check; adding actuator just for a probe isn't warranted (ponytail). `curl` installed in the runtime layer for the probe. **Devops should point the ECS/ALB target-group health check at `/health` too.** (Deviation from the task's `/actuator/health` wording — flagged.)

**Verified locally**: `docker build --platform linux/arm64` succeeds; `docker image inspect --format '{{.Os}}/{{.Architecture}}'` → `linux/arm64` (size ~551 MB); a smoke `docker run` boots Spring Boot as user `vita` with the RAM flag applied and Tomcat on 8080, failing only at the DB connection (expected, no Postgres) — proves the image is runnable. Deploy (ECR/ECS) stays with devops.

## Remaining for Done

- Production deploy (BE-004, waiting on devops prod env + CI deploy chain OPS-004/OPS-014).
</content>
