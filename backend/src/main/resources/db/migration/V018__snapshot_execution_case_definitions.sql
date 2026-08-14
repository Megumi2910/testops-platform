ALTER TABLE test_case_results
    ADD COLUMN IF NOT EXISTS retry_count_snapshot INTEGER NOT NULL DEFAULT 0;

CREATE TABLE execution_step_snapshots (
    id UUID PRIMARY KEY,
    case_result_id UUID NOT NULL REFERENCES test_case_results(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    action VARCHAR(40) NOT NULL,
    locator_type VARCHAR(40),
    locator_value VARCHAR(2000),
    locator_role VARCHAR(120),
    input_value TEXT,
    expected_value VARCHAR(4000),
    timeout_ms INTEGER,
    UNIQUE(case_result_id, position)
);

CREATE INDEX ix_execution_step_snapshots_case_result
    ON execution_step_snapshots(case_result_id, position);
