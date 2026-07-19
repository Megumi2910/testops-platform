CREATE TABLE project_variables (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    variable_key VARCHAR(64) NOT NULL,
    secret BOOLEAN NOT NULL DEFAULT FALSE,
    plaintext_value TEXT,
    ciphertext BYTEA,
    nonce BYTEA,
    key_version INTEGER,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT project_variables_key_unique UNIQUE (project_id, variable_key),
    CONSTRAINT project_variables_secret_shape CHECK ((secret = FALSE AND plaintext_value IS NOT NULL AND ciphertext IS NULL AND nonce IS NULL AND key_version IS NULL) OR (secret = TRUE AND plaintext_value IS NULL AND ciphertext IS NOT NULL AND nonce IS NOT NULL AND key_version IS NOT NULL))
);
CREATE INDEX idx_project_variables_project ON project_variables (project_id, variable_key);
