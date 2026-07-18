CREATE TABLE oauth_accounts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    provider VARCHAR(32) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    provider_email VARCHAR(254),
    created_at TIMESTAMPTZ NOT NULL,
    last_login_at TIMESTAMPTZ,
    CONSTRAINT oauth_provider_check CHECK (provider IN ('GOOGLE')),
    CONSTRAINT oauth_provider_subject_unique UNIQUE (provider, provider_subject),
    CONSTRAINT oauth_user_provider_unique UNIQUE (user_id, provider)
);

CREATE INDEX idx_oauth_user ON oauth_accounts (user_id);
