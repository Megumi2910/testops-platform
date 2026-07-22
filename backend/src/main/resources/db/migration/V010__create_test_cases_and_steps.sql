CREATE TABLE test_cases (
    id UUID PRIMARY KEY,
    suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(4000),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    tags TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    data_isolation BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT test_cases_status_check CHECK (status IN ('DRAFT', 'READY', 'ARCHIVED')),
    CONSTRAINT test_cases_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT test_cases_retry_check CHECK (retry_count BETWEEN 0 AND 5),
    CONSTRAINT test_cases_suite_name_unique UNIQUE (suite_id, name)
);

CREATE TABLE test_steps (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    action VARCHAR(40) NOT NULL,
    locator_type VARCHAR(40),
    locator_value VARCHAR(2000),
    input_value TEXT,
    timeout_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT test_steps_case_position_unique UNIQUE (case_id, position),
    CONSTRAINT test_steps_position_check CHECK (position >= 0)
);
CREATE INDEX idx_test_cases_suite ON test_cases (suite_id, name);
