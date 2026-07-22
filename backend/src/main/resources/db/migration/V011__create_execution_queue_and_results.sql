ALTER TABLE test_steps
    ADD COLUMN IF NOT EXISTS locator_role VARCHAR(120),
    ADD COLUMN IF NOT EXISTS expected_value VARCHAR(4000);

CREATE TABLE test_execution_queue_guard (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO test_execution_queue_guard(id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE test_executions (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    suite_id UUID REFERENCES test_suites(id),
    requested_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('QUEUED','RUNNING','PASSED','FAILED','ERROR','CANCELLED')),
    total_cases INTEGER NOT NULL CHECK (total_cases >= 0),
    completed_cases INTEGER NOT NULL DEFAULT 0 CHECK (completed_cases >= 0),
    passed_cases INTEGER NOT NULL DEFAULT 0 CHECK (passed_cases >= 0),
    failed_cases INTEGER NOT NULL DEFAULT 0 CHECK (failed_cases >= 0),
    error_cases INTEGER NOT NULL DEFAULT 0 CHECK (error_cases >= 0),
    cancelled_cases INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_cases >= 0),
    idempotency_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    cancel_requested_at TIMESTAMPTZ,
    error_message VARCHAR(4000),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_execution_idempotency UNIQUE(project_id, idempotency_key)
);
CREATE INDEX ix_execution_project_created ON test_executions(project_id, created_at DESC);

CREATE TABLE test_case_results (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES test_cases(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('QUEUED','RUNNING','PASSED','FAILED','ERROR','CANCELLED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message VARCHAR(4000),
    UNIQUE(execution_id, case_id)
);

CREATE TABLE test_step_results (
    id UUID PRIMARY KEY,
    case_result_id UUID NOT NULL REFERENCES test_case_results(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    action VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    duration_ms BIGINT,
    error_message VARCHAR(4000),
    UNIQUE(case_result_id, position)
);
