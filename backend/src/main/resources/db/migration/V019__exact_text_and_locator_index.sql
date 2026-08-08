ALTER TABLE test_steps
    ADD COLUMN IF NOT EXISTS locator_index INTEGER;

ALTER TABLE execution_step_snapshots
    ADD COLUMN IF NOT EXISTS locator_index INTEGER;

ALTER TABLE test_steps
    DROP CONSTRAINT IF EXISTS test_steps_locator_index_check;

ALTER TABLE test_steps
    ADD CONSTRAINT test_steps_locator_index_check CHECK (locator_index IS NULL OR locator_index >= 0);

ALTER TABLE execution_step_snapshots
    DROP CONSTRAINT IF EXISTS execution_step_snapshots_locator_index_check;

ALTER TABLE execution_step_snapshots
    ADD CONSTRAINT execution_step_snapshots_locator_index_check CHECK (locator_index IS NULL OR locator_index >= 0);
