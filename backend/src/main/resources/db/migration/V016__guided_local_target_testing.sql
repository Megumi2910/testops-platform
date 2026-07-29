ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_check_status VARCHAR(20) NOT NULL DEFAULT 'NOT_CHECKED';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_checked_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_check_http_status INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_check_reason VARCHAR(240);
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_target_check_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_target_check_status_check CHECK (target_check_status IN ('NOT_CHECKED','REACHABLE','UNREACHABLE','BLOCKED'));
ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS step_position INTEGER;
