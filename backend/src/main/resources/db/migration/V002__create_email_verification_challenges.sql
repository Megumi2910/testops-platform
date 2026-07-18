CREATE TABLE email_verification_challenges (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    purpose VARCHAR(32) NOT NULL,
    otp_hash VARCHAR(64) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    invalidation_reason VARCHAR(64),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    delivery_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    last_delivery_attempt_at TIMESTAMPTZ,
    resend_available_at TIMESTAMPTZ NOT NULL,
    source_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT email_challenge_purpose_check CHECK (purpose IN ('REGISTRATION')),
    CONSTRAINT email_challenge_attempts_check CHECK (failed_attempts >= 0 AND max_attempts = 5),
    CONSTRAINT email_challenge_delivery_check CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED')),
    CONSTRAINT email_challenge_time_check CHECK (expires_at > issued_at)
);

CREATE UNIQUE INDEX uq_email_challenge_user_active
    ON email_verification_challenges (user_id, purpose)
    WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX idx_email_challenge_user_active
    ON email_verification_challenges (user_id, purpose, expires_at);

CREATE INDEX idx_email_challenge_expiry
    ON email_verification_challenges (expires_at);
