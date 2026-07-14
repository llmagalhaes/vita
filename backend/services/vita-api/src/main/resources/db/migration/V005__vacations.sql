-- V005 — vacation ranges (BE-025, D1). One row per user: the device-local
-- vacation config stored as a single encrypted opaque blob (per-user DEK, C3,
-- ADR-0003) for durability. The server never reads or interprets these dates —
-- all vacation behaviour is device-driven. Replace-on-write (upsert). ON DELETE
-- CASCADE + crypto-shred (deleting the DEK) make the blob unreadable then gone
-- on account deletion (ADR-0004), exactly like log_entry / eating_plan.
-- Expand-only (ADR-0002).

CREATE TABLE vacation (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, -- C1
    ranges_enc bytea NOT NULL,                                           -- C3: per-user DEK, encrypted [{start,end}]
    updated_at timestamptz NOT NULL DEFAULT now()                        -- C1
);
