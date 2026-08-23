# Data Model, API, and Workflows

## 1. Data principles

The schema must preserve identity, authorization, execution ownership, and historical truth.

Four rules drive the model:

1. mutable definitions must not rewrite old results;
2. refresh tokens must be revocable and replay-detectable;
3. multiple workers must not claim the same execution;
4. large artifacts belong outside PostgreSQL.

## 2. Entity relationship overview

```mermaid
erDiagram
    USERS ||--o{ USER_ROLES : has
    ROLES ||--o{ USER_ROLES : grants
    USERS ||--o{ OAUTH_ACCOUNTS : links
    USERS ||--o{ REFRESH_TOKENS : owns
    USERS ||--o{ AUTH_AUDIT_EVENTS : generates

    USERS ||--o{ PROJECT_MEMBERS : joins
    PROJECTS ||--o{ PROJECT_MEMBERS : contains
    PROJECTS ||--o{ PROJECT_VARIABLES : defines
    PROJECTS ||--o{ TEST_SUITES : owns
    TEST_SUITES ||--o{ TEST_CASES : contains
    TEST_CASES ||--o{ TEST_STEPS : defines

    PROJECTS ||--o{ TEST_EXECUTIONS : receives
    TEST_SUITES ||--o{ TEST_EXECUTIONS : runs
    TEST_EXECUTIONS ||--o{ TEST_CASE_RESULTS : produces
    TEST_CASE_RESULTS ||--o{ TEST_STEP_RESULTS : contains
    TEST_EXECUTIONS ||--o{ EXECUTION_ARTIFACTS : stores
    TEST_CASE_RESULTS ||--o{ EXECUTION_ARTIFACTS : may_have
```

## 3. Current relational model

The tables below describe the active PostgreSQL model. The migration directory is authoritative; this document is a readable map, not a second schema definition. The current migration chain is `V001` through `V023`.

### `users`

```text
id UUID PK
email VARCHAR UNIQUE NOT NULL
password_hash VARCHAR NULL
display_name VARCHAR NOT NULL
avatar_url VARCHAR NULL
status VARCHAR NOT NULL
email_verified BOOLEAN NOT NULL
token_version INTEGER NOT NULL DEFAULT 0
last_login_at TIMESTAMPTZ NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
version BIGINT NOT NULL
```

Constraints:

- normalized email unique;
- status allowlist;
- password hash may be null only when another login method exists;
- optimistic version for administrative updates.

### `roles`

```text
id BIGSERIAL PK
code VARCHAR UNIQUE NOT NULL
name VARCHAR NOT NULL
```

Seed:

```text
ADMIN
TEST_MANAGER
MEMBER
```

### `user_roles`

```text
user_id UUID FK
role_id BIGINT FK
created_at TIMESTAMPTZ
PRIMARY KEY (user_id, role_id)
```

### `oauth_accounts`

```text
id UUID PK
user_id UUID FK
provider VARCHAR NOT NULL
provider_subject VARCHAR NOT NULL
provider_email VARCHAR NULL
created_at TIMESTAMPTZ NOT NULL
last_login_at TIMESTAMPTZ NULL
UNIQUE (provider, provider_subject)
```

### `refresh_tokens`

```text
id UUID PK
user_id UUID FK
family_id UUID NOT NULL
token_hash VARCHAR UNIQUE NOT NULL
issued_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
used_at TIMESTAMPTZ NULL
revoked_at TIMESTAMPTZ NULL
revocation_reason VARCHAR NULL
replaced_by_token_id UUID NULL
user_agent VARCHAR NULL
created_ip VARCHAR NULL
```

Indexes:

- token hash unique;
- user and active state;
- family;
- expiry for cleanup.

### `email_verification_challenges`

```text
id UUID PK
user_id UUID FK
purpose VARCHAR NOT NULL
otp_hash VARCHAR NOT NULL
issued_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
consumed_at TIMESTAMPTZ NULL
invalidated_at TIMESTAMPTZ NULL
failed_attempts INTEGER NOT NULL
max_attempts INTEGER NOT NULL
delivery_status VARCHAR NOT NULL
resend_available_at TIMESTAMPTZ NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

Only one active registration challenge may exist per user. OTP values are never stored in plaintext.

### `projects`

```text
id UUID PK
name VARCHAR NOT NULL
description TEXT NULL
target_origin VARCHAR NOT NULL
status VARCHAR NOT NULL
created_by UUID FK
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
version BIGINT NOT NULL
```

Constraints:

- valid HTTP/HTTPS URL;
- status `ACTIVE` or `ARCHIVED`;

### `project_members`

```text
id UUID PK
project_id UUID FK
user_id UUID FK
role VARCHAR NOT NULL
version BIGINT NOT NULL
created_at TIMESTAMPTZ NOT NULL
PRIMARY KEY (project_id, user_id)
```

### `project_variables`

```text
id UUID PK
project_id UUID FK
variable_key VARCHAR NOT NULL
secret BOOLEAN NOT NULL
plaintext_value TEXT NULL
ciphertext BYTEA NULL
nonce BYTEA NULL
key_version INTEGER NULL
version BIGINT NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
UNIQUE (project_id, variable_key)
```

Non-secret values may be stored directly according to implementation choice. Secret values require encryption or environment injection.

### `test_suites`

```text
id UUID PK
project_id UUID FK
name VARCHAR NOT NULL
description TEXT NULL
status VARCHAR NOT NULL
version BIGINT NOT NULL
created_by UUID FK
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### `test_cases`

```text
id UUID PK
test_suite_id UUID FK
name VARCHAR NOT NULL
description TEXT NULL
priority VARCHAR NOT NULL
status VARCHAR NOT NULL
tags TEXT NULL
retry_count INTEGER NOT NULL
data_isolation BOOLEAN NOT NULL
created_by UUID FK
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
version BIGINT NOT NULL
```

### `test_steps`

```text
id UUID PK
test_case_id UUID FK
position INTEGER NOT NULL
action VARCHAR NOT NULL
locator_type VARCHAR NULL
locator_value TEXT NULL
input_value TEXT NULL
timeout_ms INTEGER NULL
created_at TIMESTAMPTZ NOT NULL
UNIQUE (test_case_id, position)
```

Secret inputs should reference project variables, not contain resolved secrets.

### `test_executions`

```text
id UUID PK
project_id UUID FK
suite_id UUID FK NULL
requested_by UUID FK
status VARCHAR NOT NULL  -- QUEUED, RUNNING, PASSED, FAILED, ERROR, CANCELLED
total_cases INTEGER NOT NULL
completed_cases INTEGER NOT NULL
passed_cases INTEGER NOT NULL
failed_cases INTEGER NOT NULL
error_cases INTEGER NOT NULL
cancelled_cases INTEGER NOT NULL
idempotency_key UUID NOT NULL
created_at TIMESTAMPTZ NOT NULL
started_at TIMESTAMPTZ NULL
finished_at TIMESTAMPTZ NULL
heartbeat_at TIMESTAMPTZ NULL
cancel_requested_at TIMESTAMPTZ NULL
error_message TEXT NULL
browser VARCHAR NULL
target_origin_snapshot VARCHAR NULL
suite_name_snapshot VARCHAR NULL
infrastructure_error_category VARCHAR NULL
version BIGINT NOT NULL
UNIQUE (project_id, idempotency_key)
```

### `test_case_results`

```text
id UUID PK
execution_id UUID FK
case_id UUID FK
status VARCHAR NOT NULL  -- QUEUED, RUNNING, PASSED, FAILED, ERROR, CANCELLED
attempt_count INTEGER NOT NULL
started_at TIMESTAMPTZ NULL
finished_at TIMESTAMPTZ NULL
error_message TEXT NULL
case_name_snapshot VARCHAR NULL
failed_step_position INTEGER NULL
error_category VARCHAR NULL
retry_count_snapshot INTEGER NOT NULL
evidence_suppressed BOOLEAN NOT NULL
evidence_suppression_reason VARCHAR NULL
UNIQUE (execution_id, case_id)
```

`evidence_suppression_reason` is required when `evidence_suppressed` is true
and must be null otherwise. V023 also conservatively redacts legacy failure
messages and marks legacy artifacts when an immutable step snapshot referenced a
secret variable.

### `execution_step_snapshots`

```text
id UUID PK
case_result_id UUID FK
position INTEGER NOT NULL
action VARCHAR NOT NULL
locator_type VARCHAR NULL
locator_value TEXT NULL
locator_role VARCHAR NULL
locator_index INTEGER NULL
input_value TEXT NULL
expected_value TEXT NULL
timeout_ms INTEGER NULL
viewport_width INTEGER NULL
viewport_height INTEGER NULL
locale VARCHAR NULL
timezone_id VARCHAR NULL
UNIQUE (case_result_id, position)
```

### `execution_variable_snapshots`

```text
id UUID PK
execution_id UUID FK
variable_key VARCHAR NOT NULL
value TEXT NULL
secret BOOLEAN NOT NULL
ciphertext BYTEA NULL
nonce BYTEA NULL
key_version INTEGER NULL
UNIQUE (execution_id, variable_key)
```

Definition snapshots are normalized across execution, case-result,
step-snapshot, and variable-snapshot columns. The current schema does not
persist a single `definition_snapshot` or `step_snapshot` JSONB document.

### `test_step_results`

Step results and artifact relationships are persisted by the current execution model:

```text
id UUID PK
case_result_id UUID FK
position INTEGER NOT NULL
action VARCHAR NOT NULL
status VARCHAR NOT NULL
duration_ms BIGINT NULL
error_message TEXT NULL
UNIQUE (case_result_id, position)
```

### `execution_artifacts`

```text
id UUID PK
execution_id UUID FK
case_result_id UUID FK NULL
step_position INTEGER NULL
type VARCHAR NOT NULL  -- SCREENSHOT or TRACE
relative_path VARCHAR NOT NULL
content_type VARCHAR NOT NULL
byte_size BIGINT NOT NULL
sha256 VARCHAR NOT NULL
secret_suppressed BOOLEAN NOT NULL
created_at TIMESTAMPTZ NOT NULL
purged_at TIMESTAMPTZ NULL
purge_reason VARCHAR NULL
```

### `auth_audit_events`

```text
id UUID PK
user_id UUID NULL
event_type VARCHAR NOT NULL
success BOOLEAN NOT NULL
ip_address VARCHAR NULL
user_agent VARCHAR NULL
metadata JSONB NULL
created_at TIMESTAMPTZ NOT NULL
```

Metadata is filtered; it must not contain credentials or tokens.

## 4. Delete and retention behavior

| Record | Behavior |
|---|---|
| User | Disable or anonymize; preserve execution/audit references. |
| OAuth link | Remove only when another login method remains. |
| Refresh token | Revoke; purge after security retention. |
| Project | Archive after history exists. |
| Suite/case | Disable or soft-delete when referenced by results. |
| Execution | Retain according to project policy. |
| Artifact | Purge bytes while retaining metadata, `purged_at`, and a safe `purge_reason`; suppressed evidence is never downloadable. |
| Secret variable | Rotate/remove carefully; plain values never expose a secret, while execution snapshots retain only encrypted ciphertext, nonce, and key version. |

## 5. Important indexes

Start with measured, workload-oriented indexes:

```sql
CREATE INDEX idx_execution_queue
ON test_executions (status, priority, queued_at, id);

CREATE INDEX idx_execution_project_time
ON test_executions (project_id, created_at DESC);

CREATE INDEX idx_execution_worker_heartbeat
ON test_executions (status, heartbeat_at)
WHERE status = 'RUNNING';

CREATE INDEX idx_case_result_execution
ON test_case_results (execution_id);

CREATE INDEX idx_suite_project
ON test_suites (project_id);

CREATE INDEX idx_case_suite
ON test_cases (test_suite_id);

CREATE INDEX idx_refresh_user_active
ON refresh_tokens (user_id, expires_at)
WHERE revoked_at IS NULL;
```

Indexes accelerate reads but increase writes and storage. Add them from query plans rather than habit.

## 6. Migration policy

Use Flyway as the schema authority:

```text
V001__create_users_and_roles.sql
V002__create_email_verification_challenges.sql
V003__create_oauth_accounts.sql
V004__create_refresh_tokens.sql
V005__create_auth_audit_events.sql
V006__harden_authentication_indexes.sql

The early migrations establish identity, projects, variables, definitions, and execution persistence. Later migrations add unified roles, reporting, local-target checks, hardened variable snapshots, immutable case-definition snapshots, locator/context settings, Trash lifecycle, password-reset challenge purposes, and persistent evidence-suppression state with legacy redaction. Applied versions are immutable; corrections use a new migration.

V007__create_projects_and_members.sql
V008__create_project_variables.sql
V009__create_test_suites.sql
V010__create_test_cases_and_steps.sql
V011__create_execution_queue_and_results.sql
V012__create_execution_artifacts_and_variable_snapshots.sql
V013__introduce_unified_identity_and_platform_roles.sql
V014__migrate_project_roles_and_remove_legacy_roles.sql
V015__milestone_6_execution_reporting.sql
V016__guided_local_target_testing.sql
V017__harden_execution_variable_snapshots.sql
V018__snapshot_execution_case_definitions.sql
V019__exact_text_and_locator_index.sql
V020__execution_context_settings.sql
V021__definition_trash_lifecycle.sql
V022__password_reset_challenge_purpose.sql
V023__persist_evidence_suppression.sql
```

Rules:

- `ddl-auto=validate`;
- applied versioned migrations are immutable;
- corrections use a new migration;
- clean-database and upgrade-path tests both run;
- no production secrets or passwords in seed migrations.

## 7. API conventions

Base path:

```text
/api/v1
```

General response rules:

- `200 OK`: read or update;
- `201 Created`: resource creation;
- `202 Accepted`: queued execution;
- `204 No Content`: successful delete/logout without body;
- `400 Bad Request`: malformed or validation error;
- `401 Unauthorized`: missing/invalid authentication;
- `403 Forbidden`: authenticated but not permitted;
- `404 Not Found`: unavailable resource;
- `409 Conflict`: duplicate, stale version, or invalid transition;
- `429 Too Many Requests`: throttling or capacity policy;
- `503 Service Unavailable`: execution infrastructure unavailable.

### Error format

```json
{
  "type": "https://testops.example/problems/validation-error",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/projects",
  "timestamp": "2026-07-17T12:30:00Z",
  "correlationId": "request-id",
  "errors": [
    {
      "path": "name",
      "code": "NotBlank",
      "message": "Name is required",
      "stepPosition": null
    }
  ]
}
```

## 8. Current route surface

The controller mappings below are implemented in the current source. Each entry is expanded with required headers, body/query fields, permissions, and safe examples in the [API handbook](../reference/api-reference.html). Routes omitted from that handbook are considered documentation defects.

### Authentication

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/auth/providers` | Report enabled identity providers to the frontend. |
| `POST` | `/auth/register` | Create password account. |
| `POST` | `/auth/email/verify` | Verify registration OTP and issue session. |
| `POST` | `/auth/email/resend` | Resend a registration OTP with server cooldown/idempotency. |
| `POST` | `/auth/me/email/resend` | Resend verification for an authenticated unverified user. |
| `POST` | `/auth/login` | Authenticate email/password. |
| `POST` | `/auth/refresh` | Rotate refresh token and issue access JWT. |
| `POST` | `/auth/logout` | Revoke and clear session. |
| `GET` | `/auth/me` | Current local user. |
| `POST` | `/auth/sessions/revoke-all` | Revoke all current-user sessions. |
| `POST` | `/auth/password/reset/request` | Request a generic password-reset OTP. |
| `POST` | `/auth/password/reset/confirm` | Consume a reset OTP and set a new password. |
| `POST` | `/auth/me/password/challenge` | Send a challenge before password setup/change. |
| `POST` | `/auth/me/password/confirm` | Confirm a password setup challenge. |
| `PUT` | `/auth/me/password` | Change an existing password; revokes refresh sessions. |
| `POST` | `/auth/me/login-methods/google/link-intent` | Begin configured Google linking. |
| `POST` | `/auth/me/login-methods/google/unlink` | Unlink Google after confirmation. |
| `GET` | `/users/me/sessions` | Active refresh sessions for the current user. |
| `DELETE` | `/users/me/sessions/{id}` | Revoke a session. |

### Administration

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/admin/users` | Paginated platform users. |
| `PATCH` | `/admin/users/{id}/platform-role` | Change platform role with last-admin protection. |
| `PATCH` | `/admin/users/{id}/status` | Lock, disable, or activate a user. |
| `POST` | `/admin/users/{id}/sessions/revoke-all` | Revoke all sessions for a selected user. |

### Projects and membership

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/projects` | Accessible projects. |
| `POST` | `/projects` | Create project. |
| `GET` | `/projects/{id}` | Project detail. |
| `PUT` | `/projects/{id}` | Update project. |
| `POST` | `/projects/{id}/target-check` | Check the approved target and persist sanitized target health. |
| `POST` | `/projects/{id}/archive` | Archive project. |
| `POST` | `/projects/{id}/restore` | Restore a project with an `If-Match` version. |
| `GET` | `/projects/{id}/members` | Project membership. |
| `POST` | `/projects/{id}/members` | Add a member by normalized email. |
| `PUT` | `/projects/{id}/members/{userId}` | Change member role. |
| `DELETE` | `/projects/{id}/members/{userId}` | Remove member. |

### Variables

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/projects/{id}/variables` | List names and metadata; secrets masked. |
| `POST` | `/projects/{id}/variables` | Add variable. |
| `PUT` | `/projects/{id}/variables/{key}` | Rotate/update. |
| `DELETE` | `/projects/{id}/variables/{key}` | Remove. |

### Suites, cases, and steps

| Resource | Current routes |
|---|---|
| Suites | `GET/POST/PUT /projects/{projectId}/suites`, `GET/PUT /projects/{projectId}/suites/{suiteId}`, `DELETE` or archive, and restore routes |
| Cases | `GET/POST /projects/{projectId}/suites/{suiteId}/cases`, `GET/PUT/DELETE /projects/{projectId}/suites/{suiteId}/cases/{caseId}`, and restore |
| Steps | aggregate `steps` replacement on case create/update |
| Reorder | contiguous ordered bulk update in the case aggregate with optimistic version |

Lifecycle reads accept `lifecycle=ACTIVE|ARCHIVED|ALL`. Archive/restore writes require `DEFINITION_MANAGE`, an `If-Match` version where applicable, and reject archived parent projects/suites. Archived definitions remain readable for history; execution queueing is blocked until restore.

### Executions

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/v1/projects/{projectId}/suites/{suiteId}/executions` | Queue all READY cases in a suite; requires UUID `Idempotency-Key`, returns `202` plus `Location`. |
| `POST` | `/api/v1/projects/{projectId}/suites/{suiteId}/cases/{caseId}/executions` | Queue one READY case; requires UUID `Idempotency-Key`. |
| `GET` | `/api/v1/projects/{projectId}/executions` | Project execution history. |
| `GET` | `/api/v1/projects/{projectId}/executions/{executionId}` | Progress, summary, case results, and artifact metadata. |
| `GET` | `/api/v1/projects/{projectId}/executions/{executionId}/results` | Per-case results. |
| `POST` | `/api/v1/projects/{projectId}/executions/{executionId}/cancel` | Request cancellation; requester/owner/admin policy applies. |
| `GET` | `/api/v1/projects/{projectId}/executions/{executionId}/artifacts/{artifactId}` | Authorized artifact download. |

### Dashboard

```text
GET /dashboard/summary
GET /dashboard/trends
GET /dashboard/recent-failures
GET /dashboard/infrastructure-errors
```

Dashboard routes are current aggregate reads. The selected time window is normalized to UTC, filters are scoped to projects visible to the caller, and independent frontend panels expose retryable failures.

## 9. Workflow: registration

Trigger: anonymous user submits account data.

Normal path:

1. normalize email;
2. validate password policy;
3. insert user;
4. assign default role;
5. write audit event;
6. optionally send verification;
7. issue session only when policy allows.

Failure path:

- duplicate returns `409`;
- validation returns field errors;
- email provider failure does not silently create a “verified” account;
- no token is issued before transaction success.

User-visible result: authenticated dashboard or verification-required page.

## 10. Workflow: Google login

Trigger: user clicks Google sign-in.

Normal path:

1. backend creates authorization state;
2. Google authenticates;
3. backend validates callback;
4. resolve local account by provider `sub`;
5. apply account-link policy;
6. issue refresh cookie;
7. redirect to frontend callback;
8. frontend calls refresh;
9. receive TestOps JWT.

Failure path:

- denied consent returns a stable message;
- invalid state fails closed;
- account-link conflict requests confirmation;
- disabled local user receives no session;
- provider outage does not invalidate existing sessions.

## 11. Workflow: create a test case

Trigger: editor submits case and ordered steps.

Normal path:

1. authorize project edit access;
2. validate case fields;
3. validate every action/locator pair;
4. validate variable references;
5. validate URL policy;
6. persist case and ordered steps in one transaction;
7. return created definition.

Failure path:

- invalid step rejects the whole write;
- duplicate order returns validation;
- missing secret variable returns explicit reference error;
- stale optimistic version returns `409`.

## 12. Workflow: queue and claim execution

### Queue

1. authorize execution permission;
2. verify project active;
3. verify suite has enabled cases;
4. create immutable definition and target snapshots;
5. create `QUEUED` execution;
6. return `202 Accepted`.

### Claim

A worker claims one row atomically:

```sql
WITH next_execution AS (
    SELECT id
    FROM test_executions
    WHERE status = 'QUEUED'
    ORDER BY priority DESC, queued_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE test_executions e
SET status = 'RUNNING',
    worker_id = :workerId,
    claimed_at = NOW(),
    started_at = NOW(),
    heartbeat_at = NOW()
FROM next_execution n
WHERE e.id = n.id
RETURNING e.*;
```

The claim transaction commits before Playwright starts.

Failure path:

- queue capacity policy may reject before insert;
- no worker leaves state queued and visible;
- two workers cannot both own one row;
- abandoned running state is recovered by heartbeat policy.

## 13. Workflow: execute a case

1. create isolated `BrowserContext`;
2. create page;
3. resolve project variables;
4. run ordered steps;
5. save step/case results incrementally;
6. capture screenshot and trace on failure/error policy;
7. close context;
8. continue or stop according to suite policy;
9. aggregate final execution state.

Failure handling:

- assertion mismatch: `FAILED`;
- target unavailable: `ERROR`;
- browser crash: `ERROR`;
- artifact failure: preserve original result and record secondary error;
- cancellation: stop at a safe boundary and close browser;
- cleanup failure: log and report without hiding primary outcome.

## 14. Workflow: retry

Default:

```text
NEVER
INFRASTRUCTURE_ERRORS_ONLY
ALWAYS
```

For e-commerce mutation tests, default to `NEVER` or `INFRASTRUCTURE_ERRORS_ONLY`.

Retry is allowed only when:

- the case is idempotent;
- test data is resettable;
- a duplicate order or checkout cannot be created;
- attempt number and previous evidence remain visible.

Do not overwrite the first attempt.

## 15. Workflow: dashboard

Dashboard queries read persisted results.

Pass rate:

```text
passed / (passed + failed) * 100
```

Infrastructure errors are separate.

Recommended dimensions:

- project;
- suite;
- date range;
- browser;
- functional status;
- infrastructure error category.

Use database aggregation and indexes rather than loading all results into Java.

## 16. Workflow: artifact access

1. authenticate;
2. authorize project membership;
3. find metadata;
4. validate retention and existence;
5. return safe inline/download response or short-lived signed URL;
6. audit sensitive artifact access if policy requires.

Artifact filenames are generated, not built from user test names.

## 17. Polling contract

Frontend polls while:

```text
QUEUED
RUNNING
```

Stops on:

```text
PASSED
FAILED
ERROR
CANCELLED
```

`cancel_requested_at` is cancellation intent on a `QUEUED` or `RUNNING`
execution; it is not a third polling status. Use a moderate interval such as
2–5 seconds and back off for long queues. Do not create a new polling loop per
component render.

## 18. Logical definition snapshot example

This JSON is an explanatory projection of one queued definition. PostgreSQL
stores the same immutable contract in the execution, case-result,
`execution_step_snapshots`, and `execution_variable_snapshots` structures
described above rather than in one JSONB column.

```json
{
  "suiteName": "Checkout regression",
  "targetBaseUrl": "https://staging-shop.example.com",
  "browser": "chromium",
  "cases": [
    {
      "caseId": "uuid",
      "name": "Reject missing shipping address",
      "steps": [
        {
          "order": 1,
          "action": "NAVIGATE",
          "input": "/checkout"
        },
        {
          "order": 2,
          "action": "CLICK",
          "locator": {
            "type": "ROLE",
            "role": "BUTTON",
            "name": "Place order"
          }
        },
        {
          "order": 3,
          "action": "ASSERT_TEXT_CONTAINS",
          "locator": {
            "type": "TEST_ID",
            "value": "address-error"
          },
          "expected": "Shipping address is required"
        }
      ]
    }
  ]
}
```

Resolved secret values are excluded.

## 19. Concurrency invariants

- one refresh token use creates at most one replacement;
- one execution has at most one active owner;
- terminal execution state cannot return to running;
- case result counters equal persisted results;
- step order is unique;
- project membership is unique;
- an artifact belongs to one authorized execution boundary;
- cancellation and completion race resolves to one terminal state.

These invariants require database constraints and transactional service methods, not only Java `if` statements.
> Milestone 5 note: project memberships now use `PROJECT_MANAGER`, `TEST_MANAGER`, `TESTER`, and `VIEWER`, and project responses include effective permissions. Legacy `OWNER`, `EDITOR`, and global `TEST_MANAGER` values are migration inputs only.
