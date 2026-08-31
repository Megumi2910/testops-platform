# Pre-merge target-origin registry test boundary

## Covered behavior

| Area | Evidence |
|---|---|
| Canonical form | case/trailing slash/default port normalize to one origin; credentials and unsafe literal addresses fail |
| Registry sources | environment rows remain read-only and retain project usage counts |
| Duplicate safety | an administrator cannot add a canonical duplicate of an environment origin |
| Dynamic disable | disabling an administrator origin removes it from selectable values and new policy validation |
| Local bridge disabled | a localhost-only bootstrap configuration shows the project-setup block instead of offering an unusable target |
| Form recovery | blank project name and target origin receive specific native field errors and focus |
| UI roles | administrator add control is permission-gated; members receive guidance instead |

## Commands

```powershell
.\backend\mvnw.cmd -f backend\pom.xml -B -DskipITs test
npm --prefix frontend test -- --run src/features/projects/ProjectPages.test.tsx src/features/auth/AdminUsersPage.test.tsx
npm --prefix frontend run typecheck
```

The local focused run passed: backend 199 tests; frontend 14 focused tests; TypeScript check passed; and the V024 migration upgrade passed against PostgreSQL 18. `ApplicationContextIT` also asserts that its Flyway health probe reaches semantic version `24`, preventing a newly added migration from leaving the full Maven gate stale. The final candidate verification additionally runs the live administrator/member browser matrix against a rebuilt local stack.
