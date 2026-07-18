CREATE TABLE auth_audit_events (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(64),
    user_agent VARCHAR(512),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_auth_audit_user_time
    ON auth_audit_events (user_id, created_at DESC);

CREATE INDEX idx_auth_audit_type_time
    ON auth_audit_events (event_type, created_at DESC);
