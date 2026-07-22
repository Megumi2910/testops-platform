CREATE TABLE execution_variable_snapshots (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    variable_key VARCHAR(64) NOT NULL,
    value TEXT,
    secret BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(execution_id, variable_key)
);

CREATE TABLE execution_artifacts (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    case_result_id UUID REFERENCES test_case_results(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('SCREENSHOT','TRACE')),
    relative_path VARCHAR(1000) NOT NULL,
    content_type VARCHAR(200) NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    secret_suppressed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_execution_artifacts_execution ON execution_artifacts(execution_id, created_at);
