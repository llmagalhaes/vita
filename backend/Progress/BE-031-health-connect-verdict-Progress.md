# BE-031 — Health Connect ingestion: backend verdict (ADR-0016)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216590099127127

## State: DONE locally (2026-07-15) — decision recorded in ADR-0016. Docs-only.

## Verdict: the backend builds NOTHING for the Health Connect milestone.

Health Connect data is device-local (SQLite), which is the display source;
trends are client-side (D4); there is no multi-device/delta sync in v0; the data
is a re-syncable mirror of an external source, not user-authored. Under
data-minimization (store strictly what is necessary), copying it to the server
buys nothing and costs storage + attack surface. So health-sourced entries stay
in device SQLite and are **not** pushed to `POST /entries` / the outbox.

## Spec checks the milestone asked for
1. **Write path & `source`** — `POST /entries` stamps `source='user'` (DB default;
   `NewEntry` has no `source` field, insert never sets it). **Correct as-is, not
   broken** — the backend never receives a health entry in the local-only model,
   so `user` is always right. No fix.
2. **Device energy ("spent") server persistence** — **not needed.** Client-side
   trends (D4) + SQLite display source ⇒ local-only. Answer: no.
3. **Contract change** — **none.** `EntrySource` already carries
   `user|apple_health|health_connect` for a possible future ingestion path; no
   `NewEntry.source` field added now (YAGNI). Committed contract unchanged —
   matches what the app team was told (no new backend calls).
4. **Apple Health (later)** — same shape ⇒ same verdict, build nothing.

## Flip path (documented in ADR-0016, not built)
If health data must ever be server-durable: additive optional `NewEntry.source`
(bump + wire to InsertData/insert SQL; `source` column + CHECK already exist, no
migration) + a de-dup/idempotency scheme for re-synced ranges (deterministic key
from the provider record id).

## Coordination (relay to app team via orchestrator)
The app must **not** enqueue `source: health_connect` entries to the outbox. They
are SQLite-only. Contract unchanged confirms this by omission.
