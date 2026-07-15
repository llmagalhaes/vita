-- V007 — OIDC identities (BE-007, ADR-0015). Maps a verified (provider, subject)
-- to a Vita user so Google/Apple sign-in converges on the same account model as
-- magic-link. subject is the provider's opaque, stable user id (the `sub` claim) —
-- not PII we can read back to a person, so C1 plaintext. Email/name stay in `users`
-- (encrypted); we store nothing extra here (data minimization, ADR-0003).
-- One user may have several identities (Google AND Apple → same account, linked by
-- verified email); a given (provider, subject) belongs to exactly one user.

CREATE TABLE oidc_identity (
    provider   text NOT NULL CHECK (provider IN ('google', 'apple')),   -- C1
    subject    text NOT NULL,                                           -- C1: provider `sub` (opaque)
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,   -- C1
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

-- Crypto-shred/hard-delete cascades from users; this index makes the cascade + any
-- per-user identity lookup cheap.
CREATE INDEX oidc_identity_user ON oidc_identity (user_id);
