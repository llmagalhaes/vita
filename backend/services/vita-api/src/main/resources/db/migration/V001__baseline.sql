-- V001 — baseline: users, user_keys, log_entry.
-- Column classes per ADR-0003: C1 operational, C2 aggregable numbers (plaintext
-- so SQL can GROUP BY), C3 sensitive content (AES-256-GCM bytea = iv||ciphertext||tag).
-- Expand/contract only from here on (single prod env, ADR-0002).

CREATE TABLE users (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- C1
    email_hash            bytea NOT NULL UNIQUE,                      -- C1: HMAC-SHA256 blind index for login lookup
    email_enc             bytea NOT NULL,                             -- C3: service DEK (needed around the account boundary)
    name_enc              bytea,                                      -- C3: per-user DEK
    units                 text NOT NULL DEFAULT 'metric'
                              CHECK (units IN ('metric', 'imperial')), -- C1
    created_at            timestamptz NOT NULL DEFAULT now(),         -- C1
    deletion_requested_at timestamptz                                 -- C1: 7-day grace (ADR-0004)
);

-- Per-user KMS-wrapped DEK, separate row so deleting it = instant crypto-shred
-- of all the user's C3 data, including inside backups (ADR-0003).
CREATE TABLE user_keys (
    user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, -- C1
    wrapped_dek bytea NOT NULL,                                           -- C1: opaque without the KMS CMK
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Timeline spine. One row per confirmed entry; the document-shaped detail
-- (meal items / exercises / titles) is one encrypted jsonb blob, schema-versioned
-- by a "v" field inside the payload (ADR-0002).
CREATE TABLE log_entry (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),                    -- C1
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,         -- C1
    type              text NOT NULL CHECK (type IN ('meal', 'water', 'workout')),    -- C1
    occurred_at       timestamptz NOT NULL,                                          -- C2
    logged_at         timestamptz NOT NULL DEFAULT now(),                            -- C2
    updated_at        timestamptz NOT NULL DEFAULT now(),                            -- C2: offline-sync freshness marker
    input_method      text NOT NULL CHECK
                          (input_method IN ('voice', 'text', 'photo', 'tap', 'checkin', 'import')), -- C1
    source            text NOT NULL DEFAULT 'user'
                          CHECK (source IN ('user', 'apple_health', 'health_connect')), -- C1
    is_estimate       boolean NOT NULL DEFAULT false,                                -- C1
    source_phrase_enc bytea,                                                         -- C3: the user's original words
    detail_enc        bytea NOT NULL,                                                -- C3: encrypted jsonb EntryDetail
    -- C2 denormalized numbers, recomputed from detail on write; trends GROUP BY these.
    kcal              numeric CHECK (kcal >= 0),
    protein_g         numeric CHECK (protein_g >= 0),
    carbs_g           numeric CHECK (carbs_g >= 0),
    fat_g             numeric CHECK (fat_g >= 0),
    water_ml          integer CHECK (water_ml > 0),
    duration_min      integer CHECK (duration_min > 0),
    -- C1 idempotent create (Idempotency-Key header, contract /entries POST).
    idempotency_key   text,
    request_hash      bytea,
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX log_entry_user_timeline ON log_entry (user_id, occurred_at DESC);
