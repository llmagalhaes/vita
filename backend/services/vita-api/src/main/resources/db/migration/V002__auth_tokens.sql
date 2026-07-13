-- V002 — magic-link + refresh tokens (BE-006/BE-008).
-- Classes per ADR-0003: token hashes are C1 (opaque without the plaintext token);
-- magic_link_token.email_enc is C3 (service DEK — exists before the user row does).

CREATE TABLE magic_link_token (
    token_hash  bytea PRIMARY KEY,                  -- C1: SHA-256 of the single-use token
    email_enc   bytea NOT NULL,                     -- C3: service DEK
    expires_at  timestamptz NOT NULL,               -- C1: 15 min from creation
    consumed_at timestamptz,                        -- C1: set exactly once on verify
    created_at  timestamptz NOT NULL DEFAULT now()  -- C1
);

CREATE TABLE refresh_token (
    token_hash  bytea PRIMARY KEY,                                          -- C1: SHA-256
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,      -- C1
    family_id   uuid NOT NULL,  -- C1: rotation chain; reuse of a rotated token revokes the family
    expires_at  timestamptz NOT NULL,                                       -- C1: 60 days
    revoked_at  timestamptz,                                                -- C1
    created_at  timestamptz NOT NULL DEFAULT now()                          -- C1
);

CREATE INDEX refresh_token_family ON refresh_token (family_id);
