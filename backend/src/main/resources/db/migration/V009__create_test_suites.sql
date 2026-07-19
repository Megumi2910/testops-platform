CREATE TABLE test_suites (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    description VARCHAR(2000),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version BIGINT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT test_suites_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT test_suites_project_name_unique UNIQUE (project_id, name)
);
CREATE INDEX idx_test_suites_project ON test_suites (project_id, name);
