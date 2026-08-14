ALTER TABLE test_suites
    ADD COLUMN archived_at TIMESTAMPTZ,
    ADD COLUMN archived_by UUID REFERENCES users(id);

ALTER TABLE test_cases
    ADD COLUMN archived_at TIMESTAMPTZ,
    ADD COLUMN archived_by UUID REFERENCES users(id);

ALTER TABLE test_suites DROP CONSTRAINT test_suites_project_name_unique;
ALTER TABLE test_cases DROP CONSTRAINT test_cases_suite_name_unique;

CREATE UNIQUE INDEX ux_test_suites_active_project_name
    ON test_suites (project_id, lower(name))
    WHERE status <> 'ARCHIVED';

CREATE UNIQUE INDEX ux_test_cases_active_suite_name
    ON test_cases (suite_id, lower(name))
    WHERE status <> 'ARCHIVED';

CREATE INDEX ix_test_suites_project_lifecycle
    ON test_suites (project_id, status, name);

CREATE INDEX ix_test_cases_suite_lifecycle
    ON test_cases (suite_id, status, name);
