ALTER TABLE test_executions
    ADD COLUMN IF NOT EXISTS browser VARCHAR(40),
    ADD COLUMN IF NOT EXISTS target_origin_snapshot VARCHAR(500),
    ADD COLUMN IF NOT EXISTS suite_name_snapshot VARCHAR(200),
    ADD COLUMN IF NOT EXISTS infrastructure_error_category VARCHAR(40);

ALTER TABLE test_case_results
    ADD COLUMN IF NOT EXISTS case_name_snapshot VARCHAR(200),
    ADD COLUMN IF NOT EXISTS failed_step_position INTEGER,
    ADD COLUMN IF NOT EXISTS error_category VARCHAR(40);

ALTER TABLE execution_artifacts
    ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS purge_reason VARCHAR(120);

CREATE INDEX IF NOT EXISTS ix_execution_project_status_created ON test_executions(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_case_results_execution_status ON test_case_results(execution_id, status);
