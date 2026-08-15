# Phase 5 — Final administrator conflict guidance

## Outcome

The administration user page now maps structured mutation errors to stable,
actionable guidance. A `final_active_admin` conflict tells the operator to keep
another active administrator before demoting or disabling the account. Other
known validation and missing-user responses also receive safe, concise text;
unknown API errors keep their server-provided message without exposing stack
details.

The backend remains the source of truth. The UI does not pre-count or guess
which administrator is safe to change, because concurrent administrators can
change status at the same time. The server's locked final-admin check still
decides the request and the UI explains that decision after the response.

## Source map

| Concern | Source |
| --- | --- |
| Structured admin error mapping | `frontend/src/features/auth/AccountPages.tsx` (`adminMutationError`) |
| Status/role controls and pending lock | `frontend/src/features/auth/AccountPages.tsx` (`AdminUsersPage`) |
| Final-admin regression | `frontend/src/features/auth/AdminUsersPage.test.tsx` |
| Authoritative invariant | `backend/src/main/java/com/megumi/testops/auth/service/AdminUserService.java` |

## Behavioral contract

- `final_active_admin` renders guidance to keep another active administrator.
- `user_not_found` asks the operator to refresh the list.
- Invalid role/status values render a field-specific correction.
- Unknown failures remain generic or server-provided and never include stack
  traces or credentials.
- Select controls stay pending-locked during the request.
- The backend continues to prevent zero active administrators under concurrency.

## Verification

The focused administrator suite covers pagination, list retry, and final-admin
conflict guidance. Backend service and browser matrix tests remain authoritative
for the invariant itself.
