-- V008 — eating-plan portion overlay (meal-plan round, CEO 2026-07-22 #1).
-- One row per user: the sparse {PlanItem.id: qty} map for the CURRENT
-- eating_plan version, PLAINTEXT jsonb (CEO amendment A1 2026-07-22:
-- portions are not sensitive — no per-user DEK, no AAD). plan_id pins the
-- version the overlay belongs to; a new import resets it (row deleted).
-- Portion changes never create plan versions. ON DELETE CASCADE cleans it
-- on account deletion — plain FK cascade, no crypto-shred involvement.
-- Expand-only (CREATE TABLE only — rollback gate, spec section 6).

CREATE TABLE plan_portions (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,      -- C1
    plan_id    uuid NOT NULL REFERENCES eating_plan (id) ON DELETE CASCADE,   -- C1: the version this overlay is bound to
    portions   jsonb NOT NULL,                                                -- C1: plaintext {itemId: qty} (CEO A1)
    updated_at timestamptz NOT NULL DEFAULT now()                             -- C1
);
