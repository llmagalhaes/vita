# BE-017 — GET /entries: from/to window + CSV type filter (contract v0.4.0)

Asana: Vita backend board (`1216519867368580`), ticket BE-017 (was "To do").
Slice 2 "F2 Workout, complete"; also gates F8 (trends) range reads.

## What / why

`GET /v1/entries` gains three additive query params. Existing single-`date`
behaviour and the keyset cursor are UNCHANGED.

- `from` / `to` — a half-open `[from, to)` occurredAt window (either bound
  optional), RFC 3339 date-time. For trends/history bulk reads. Mutually
  exclusive with `date` (sending both → 400). Half-open matches the existing
  `DayRange` convention, so a `to`-boundary entry is excluded (tested).
- `type` — CSV allow-list of entry types (Spring binds `?type=a,b` to a
  `List<String>`). Home sends `type=meal,water,workout` (excludes check-ins);
  Habits sends `type=checkin`. Accepted values: `meal,water,workout,checkin`;
  any other value → 400. `checkin` is accepted forward-compatibly (the entry
  type ships in BE-024) and matches nothing until then.

`type` applies alongside `date` too (Home's Today screen calls
`date=…&tz=…&type=meal,water,workout`).

## First piece of contract v0.4.0

Bumped `version: 0.3.0 → 0.4.0` (additive; no 0.3.0 consumer breaks). v0.4.0
accumulates more later (plan history/edit BE-019/020, `/me/vacations` BE-025,
`checkin` entry type + CheckinDetail BE-024). redocly exit 0.

## Files changed

- `docs/contracts/vita-api-v0.yaml` — version bump; `from`/`to`/`type` params +
  description on `GET /entries`.
- `entries/controller/EntryController.kt` — new `from`/`to` (`@DateTimeFormat`
  ISO date-time) + `type: List<String>?` params, passed through.
- `entries/service/EntryService.kt` — `list(...)` resolves date-vs-from/to
  (mutually exclusive), validates the `type` CSV against `FILTERABLE_TYPES`
  (entry types + `checkin`).
- `entries/repository/EntryRepository.kt` — `list(...)` now takes
  `from`/`toExclusive`/`types` (replacing the single `DayRange` param); dynamic
  WHERE adds `occurred_at >= ?`, `occurred_at < ?`, `type IN (…)`. Runs on the
  existing `(user_id, occurred_at, id)` timeline index; `type` is a residual
  filter (fine at 5-user scale — no new index/migration).
- `entries/TimelineFlowTest.kt` — +5 cases: from/to half-open window, `type`
  CSV single + multi, `checkin` accepted-but-empty, unknown type → 400,
  `date`+`from` → 400.

## DoD

- `./gradlew check` green — **89/89 tests** (was 84; +5), detekt + ktlint clean.
  Two `list` fns got `@Suppress("LongParameterList")` (7 params — each 1:1 with
  a contract param / optional SQL filter).
- redocly lint exit 0 (25 pre-existing cosmetic operationId/tag warnings only).
- Layering unchanged: controller → service → repository (ADR-0012).

## Follow-ups / dependencies

- App team (via orchestrator): contract is now v0.4.0. Home Today can filter
  `type=meal,water,workout`; Habits can query `type=checkin` (empty until
  BE-024); trends can pull windows with `from`/`to`.
- BE-024 will add `checkin` to the LogEntry `type` enum + `CheckinDetail`;
  `FILTERABLE_TYPES` already derives from `EntryType.entries + "checkin"`, so it
  auto-tracks once `checkin` becomes an entry type.
