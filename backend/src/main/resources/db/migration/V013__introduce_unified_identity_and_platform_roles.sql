ALTER TABLE users ADD COLUMN platform_role VARCHAR(20);

UPDATE users u
SET platform_role = CASE
    WHEN EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.code = 'ADMIN'
    ) THEN 'ADMIN'
    ELSE 'MEMBER'
END
WHERE platform_role IS NULL;

ALTER TABLE users ALTER COLUMN platform_role SET DEFAULT 'MEMBER';
ALTER TABLE users ALTER COLUMN platform_role SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_platform_role_check CHECK (platform_role IN ('ADMIN', 'MEMBER'));

CREATE TABLE local_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);

INSERT INTO local_credentials (user_id, password_hash, password_changed_at)
SELECT id, password_hash, COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM users
WHERE password_hash IS NOT NULL;

ALTER TABLE email_verification_challenges
    DROP CONSTRAINT IF EXISTS email_challenge_purpose_check;
ALTER TABLE email_verification_challenges
    ADD CONSTRAINT email_verification_challenges_purpose_check
    CHECK (purpose IN ('REGISTRATION', 'ADD_PASSWORD'));

CREATE INDEX idx_users_platform_role ON users (platform_role);
