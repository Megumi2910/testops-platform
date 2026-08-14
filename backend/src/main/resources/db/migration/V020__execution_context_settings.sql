ALTER TABLE test_steps
    ADD COLUMN IF NOT EXISTS viewport_width INTEGER,
    ADD COLUMN IF NOT EXISTS viewport_height INTEGER,
    ADD COLUMN IF NOT EXISTS locale VARCHAR(80),
    ADD COLUMN IF NOT EXISTS timezone_id VARCHAR(120);

ALTER TABLE execution_step_snapshots
    ADD COLUMN IF NOT EXISTS viewport_width INTEGER,
    ADD COLUMN IF NOT EXISTS viewport_height INTEGER,
    ADD COLUMN IF NOT EXISTS locale VARCHAR(80),
    ADD COLUMN IF NOT EXISTS timezone_id VARCHAR(120);

ALTER TABLE test_steps
    DROP CONSTRAINT IF EXISTS test_steps_viewport_width_check,
    DROP CONSTRAINT IF EXISTS test_steps_viewport_height_check,
    ADD CONSTRAINT test_steps_viewport_width_check CHECK (viewport_width IS NULL OR viewport_width BETWEEN 320 AND 3840),
    ADD CONSTRAINT test_steps_viewport_height_check CHECK (viewport_height IS NULL OR viewport_height BETWEEN 240 AND 2160);

ALTER TABLE execution_step_snapshots
    DROP CONSTRAINT IF EXISTS execution_step_snapshots_viewport_width_check,
    DROP CONSTRAINT IF EXISTS execution_step_snapshots_viewport_height_check,
    ADD CONSTRAINT execution_step_snapshots_viewport_width_check CHECK (viewport_width IS NULL OR viewport_width BETWEEN 320 AND 3840),
    ADD CONSTRAINT execution_step_snapshots_viewport_height_check CHECK (viewport_height IS NULL OR viewport_height BETWEEN 240 AND 2160);
