# ADR-0016 — Health Connect (Samsung Health / Google Fit) ingestion is device-local; the backend persists nothing in v0

**Status:** Accepted — 2026-07-15 (health-integrations milestone; BE-031)

## Context

The CEO called the health-integrations milestone: **Samsung Health via Android
Health Connect** (and assess Google Fit). The app team builds the device side in
parallel: it reads Health Connect (workouts, activity, energy spent, cycle where
available) into local SQLite, and may create entries carrying `source:
health_connect`.

The contract already anticipated this shape: `EntrySource` is an enum
`[user, apple_health, health_connect]`, and `LogEntry.source` is a server-set
field. The open question for this milestone is narrow: **what, if anything, does
the *backend* need to build so this data works?**

Governing facts:

- **Trends are client-side** (CEO D4). The backend never aggregates the log for
  display.
- **SQLite is the display source.** The app renders from its local store, not
  from `GET /entries`.
- **No multi-device sync, no delta sync in v0** (contract note on `GET /entries`:
  the app refreshes by day and infers deletes from omissions).
- **Data responsibility** (core premise): store strictly what is necessary;
  sensitive data encrypted.
- Health Connect data is a **re-syncable mirror of an external source**, not
  user-authored content. If the app is reinstalled it re-reads Health Connect;
  nothing is lost by not copying it to the server.

## Decision

**The backend builds nothing for Health Connect ingestion in v0. Health-sourced
data stays device-local (SQLite only) and is NOT pushed to `POST /entries` / the
outbox.**

Rationale, on the ponytail + privacy ladder:

1. **Does this need to exist at all?** No. Server persistence of health data
   buys nothing here — there is no server-side aggregation (D4), no multi-device
   read-back (SQLite is the display source), and no durability need (the data is
   re-syncable from the device). Storing a duplicate copy on the server would
   store *more* than necessary, against the data-minimization premise, for zero
   product benefit and non-zero cost/attack-surface.

2. **The existing write path is already correct for this decision — not broken.**
   `POST /entries` stamps `source = 'user'` (the `log_entry.source` DB default;
   `NewEntry` has no `source` field and the insert never sets it). Because
   health data is device-local and never reaches the backend, every create the
   backend *does* receive genuinely is a user action, so `user` is the right
   stamp. No fix is needed. The contract's existing note — "/entries creates are
   always `user`; health ingestion writes the others via a separate path" —
   remains accurate.

3. **No contract change.** `EntrySource` already carries the health values for a
   possible future server-side ingestion path; we do **not** add a
   `NewEntry.source` field now (YAGNI). The committed contract is unchanged, which
   is exactly what the app team was told to assume ("no new backend calls unless
   the committed contract says otherwise").

4. **Apple Health (v1, later) follows the same shape → same verdict.** Same
   device-local model, same "build nothing" conclusion. This ADR covers it; do
   not build a separate Apple-Health backend path speculatively.

## Consequences

- The health-integrations milestone has a backend footprint of **this ADR plus
  zero code**. The device-side read, SQLite persistence, and client-side trends
  are entirely the app team's.
- **Coordination (relayed via the orchestrator):** the app must **not** enqueue
  `source: health_connect` entries into the outbox / `POST /entries`. They live
  only in local SQLite. Contract unchanged confirms this by omission.
- Provenance/labeling of health data (e.g. "from Health Connect", estimate
  labels) is a device concern; the backend holds no health rows to label.

## The flip path (not built now)

If a future CEO decision requires health data to be **server-durable** (e.g. a
cross-device or backup requirement lands), the minimal additive change is:

1. Optional `NewEntry.source` (contract additive bump + ADR), default `user`,
   validated against the `EntrySource` enum; the server accepts
   `health_connect` / `apple_health` from a trusted client.
2. Wire it through `InsertData` → the insert SQL (`source` column already exists
   with the right CHECK constraint — no migration).
3. Decide **de-duplication / idempotency** for re-synced ranges, so re-reading
   the same Health Connect window doesn't duplicate entries (a deterministic
   idempotency key derived from the provider record id is the likely shape —
   the `(user_id, idempotency_key)` uniqueness is already there).

None of this is built now. This section exists so the next session doesn't
re-derive it from scratch.

## Alternatives considered

- **A separate "health ingestion" endpoint/contract (the old W6 sketch).** An
  invented epic for data the product neither aggregates nor reads back server-
  side. Rejected as speculative.
- **Let `POST /entries` accept a client-supplied `source` now.** Additive but
  speculative — it presumes the app pushes health entries, which this ADR
  decides it does not. Deferred to the flip path above.
