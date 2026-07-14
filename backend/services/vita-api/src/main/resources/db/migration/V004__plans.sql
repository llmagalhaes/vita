-- V004 — eating_plan + training_program: versioned, encrypted plan/program docs
-- (BE-019 / BE-020, ADR-0011 ext). One row per stored version; the whole
-- document (EatingPlanDraft / TrainingProgramDraft shape) is a single
-- AES-256-GCM blob under the per-user DEK (C3, ADR-0003) — never plaintext at
-- rest, never server-aggregated. POST appends a version (cap
-- vita.plans.history-max, oldest dropped); PUT re-encrypts the newest row in
-- place; past versions are frozen. ON DELETE CASCADE + crypto-shred (deleting
-- the DEK) make these rows unreadable then gone on account deletion (ADR-0004),
-- exactly like log_entry. Expand-only (ADR-0002).

CREATE TABLE eating_plan (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),            -- C1
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, -- C1
    doc_enc    bytea NOT NULL,                                        -- C3: per-user DEK, encrypted EatingPlanDraft
    created_at timestamptz NOT NULL DEFAULT now()                     -- C2: version marker
);
CREATE INDEX eating_plan_user_version ON eating_plan (user_id, created_at DESC, id DESC);

CREATE TABLE training_program (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),            -- C1
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, -- C1
    doc_enc    bytea NOT NULL,                                        -- C3: per-user DEK, encrypted TrainingProgramDraft
    created_at timestamptz NOT NULL DEFAULT now()                     -- C2: version marker
);
CREATE INDEX training_program_user_version ON training_program (user_id, created_at DESC, id DESC);
