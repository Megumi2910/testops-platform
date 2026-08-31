CREATE TABLE target_origins (
    id UUID PRIMARY KEY,
    origin VARCHAR(2048) NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX ix_target_origins_enabled ON target_origins (enabled, origin);
