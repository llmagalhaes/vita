-- V009 — async eating-plan import tracker (V3 round). State only: the job's
-- input lives in memory for the one in-process run (text/PDF bytes are never
-- persisted, ADR-0005) and its result IS the saved eating_plan row (status
-- "review" inside the encrypted doc). No PII: failure holds a fixed server
-- phrase, never document content. Swept after 7 days (TokenCleanupJob).
CREATE TABLE plan_parse_job (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    state      text NOT NULL CHECK (state IN ('running', 'done', 'failed')),
    failure    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_parse_job_user_idx ON plan_parse_job (user_id, created_at DESC);
