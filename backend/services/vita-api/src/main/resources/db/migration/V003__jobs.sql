-- V003 — generic async job queue (ADR-0007: Postgres FOR UPDATE SKIP LOCKED,
-- no SQS). First use is the account-deletion crypto-shred (BE-010, ADR-0004).
-- All columns C1: no user content lives here — payload carries ids only.
-- Expand-only from here (single prod env, ADR-0002).

CREATE TABLE job (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type       text NOT NULL,
    payload    jsonb NOT NULL DEFAULT '{}',       -- ids only, never C3 content
    run_after  timestamptz NOT NULL DEFAULT now(), -- earliest claim time (grace end)
    state      text NOT NULL DEFAULT 'pending'
                   CHECK (state IN ('pending', 'done', 'failed')),
    attempts   int NOT NULL DEFAULT 0,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Claim scan: only pending rows, oldest run_after first.
CREATE INDEX job_claim ON job (run_after) WHERE state = 'pending';
