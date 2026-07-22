# Milestone 5 — Identity, authorization, and account operations

Milestone 5 turns the Milestone 4 execution workspace into a multi-user platform. It uses one `users` record per person and supports multiple login methods on that account.

## Account model

- `users` stores the canonical email, display name, status, verification state, token version, and singular platform role (`ADMIN` or `MEMBER`).
- `local_credentials` stores the optional password hash. A Google-only account has no local credential row; adding a password requires an email OTP.
- `oauth_accounts` stores provider identity (`GOOGLE`, provider subject, and provider email) and points back to the same user.
- Automatic email-based account linking is deliberately disabled. An existing password account must explicitly start the authenticated Google-link flow.
- Google can be unlinked only after a password is configured and confirmed, so an account is never left without a login method.

## Roles and permissions

Every newly registered account is an active `MEMBER` with no project memberships. The bootstrap account is the first `ADMIN`. Platform administrators manage users, platform status, projects, and all project operations.

Project memberships use `PROJECT_MANAGER`, `TEST_MANAGER`, `TESTER`, and `VIEWER`. The effective project role and a stable permission set are returned in `ProjectResponse`; the backend remains authoritative for every mutation.

| Project role | Intended access |
| --- | --- |
| `PROJECT_MANAGER` | Project settings, members, variables, definitions, all executions, and results |
| `TEST_MANAGER` | Test suites/cases/steps and execution operations; no members or variables |
| `TESTER` | Run ready cases, cancel own executions, and view results/artifacts |
| `VIEWER` | Read-only definitions, execution results, and artifacts |

The final administrator cannot be demoted or disabled. A project must always retain at least one `PROJECT_MANAGER`.

## HTTP contracts

Account operations are available under `/api/v1/auth/me` for password setup/change and Google unlink/link intent. Administrator user management is under `/api/v1/admin/users`. `/api/v1/platform/options` exposes non-secret target-origin, execution, step-action, and locator capabilities for the frontend.

The existing `/api/v1/projects`, definition, variable, and execution routes remain stable. Project responses now include `currentUserProjectRole` and `permissions` so clients can present role-aware controls without treating client state as authorization.

## Migration and operations

`V013` introduces `platform_role` and copies existing password hashes into `local_credentials`. `V014` maps legacy project roles (`OWNER`/`ADMIN` → `PROJECT_MANAGER`, `EDITOR` → `TEST_MANAGER`), records `assigned_by`, and removes the obsolete global role join tables and `users.password_hash`.

Back up PostgreSQL before applying these migrations to an existing installation. Migrations are forward-only; never edit an applied migration. CI uses isolated PostgreSQL data and fake OAuth/OTP settings and never contacts Google, SMTP, or the live target.

## Deferred work

This milestone does not add reporting dashboards, schedules, notifications, distributed workers, additional OAuth providers, or target-specific e-commerce suites. Those remain future milestones.
