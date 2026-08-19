-- V012 — the settings blob (BE-056, v4). One row per user: the device-local
-- settings bundle (habits, composition flags, notification prefs, recap hour,
-- vacation prefs, plan provenance) stored as a single encrypted opaque blob
-- (per-user DEK, C3, ADR-0003) so a reinstall can recover it. The server never
-- reads or interprets the contents — recovery-only, last-write-wins, no merge
-- (CEO Round 14 #8). Replace-on-write (upsert). ON DELETE CASCADE + crypto-shred
-- (deleting the DEK) make the blob unreadable then gone on account deletion
-- (ADR-0004), exactly like vacation / log_entry / eating_plan.
-- Expand-only (ADR-0002).

CREATE TABLE user_settings (
    user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, -- C1
    settings_enc bytea NOT NULL,                                           -- C3: per-user DEK, encrypted {...}
    updated_at   timestamptz NOT NULL DEFAULT now()                        -- C1
);
