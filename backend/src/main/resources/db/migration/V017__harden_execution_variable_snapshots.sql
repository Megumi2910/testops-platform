ALTER TABLE execution_variable_snapshots
    ADD COLUMN IF NOT EXISTS ciphertext BYTEA,
    ADD COLUMN IF NOT EXISTS nonce BYTEA,
    ADD COLUMN IF NOT EXISTS key_version INTEGER;

CREATE INDEX IF NOT EXISTS ix_execution_variable_snapshots_execution
    ON execution_variable_snapshots(execution_id, variable_key);
