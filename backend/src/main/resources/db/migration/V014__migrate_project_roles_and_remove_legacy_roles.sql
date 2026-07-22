UPDATE project_members SET role = 'PROJECT_MANAGER' WHERE role IN ('OWNER', 'ADMIN');
UPDATE project_members SET role = 'TEST_MANAGER' WHERE role = 'EDITOR';

ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE project_members ADD CONSTRAINT project_members_role_check
    CHECK (role IN ('PROJECT_MANAGER', 'TEST_MANAGER', 'TESTER', 'VIEWER'));

ALTER TABLE project_members ADD COLUMN assigned_by UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE project_members pm SET assigned_by = p.created_by
FROM projects p WHERE p.id = pm.project_id AND pm.assigned_by IS NULL;

DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
