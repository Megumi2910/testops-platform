CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    family_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(64),
    replaced_by_token_id UUID REFERENCES refresh_tokens(id),
    user_agent VARCHAR(512),
    created_ip VARCHAR(64),
    CONSTRAINT refresh_token_time_check CHECK (expires_at > issued_at)
);

CREATE INDEX idx_refresh_user_active
    ON refresh_tokens (user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_refresh_family
    ON refresh_tokens (family_id);

CREATE INDEX idx_refresh_expiry
    ON refresh_tokens (expires_at);
