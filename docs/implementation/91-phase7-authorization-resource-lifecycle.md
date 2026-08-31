# Phase 7 authorization and resource lifecycle

Phase 7 closes the active-session and project-resource boundaries that sit
between account authentication and TestOps workspace operations.

## Session revocation

`AdminUserService` treats a role or status mutation as a security boundary.
Only an actual status transition invokes `AuthService.revokeAllSessions`, so
locked, disabled, and reactivated accounts invalidate every prior refresh
family and bearer token without double-incrementing the token version. An
unchanged status is idempotent and does not create a new revocation event.

The focused backend regression covers disable, reactivation, unchanged status,
and final-active-administrator protection.

## Client terminal refresh behavior

The shared JSON and artifact request paths now share a bounded one-retry
refresh policy. A failed refresh clears the in-memory bearer and publishes a
terminal-auth event exactly once; `AuthProvider` subscribes to that event and
clears the authenticated UI state. Blob downloads no longer recurse forever
when refresh remains unauthorized. Non-terminal responses such as validation,
rate-limit, and server errors retain their original `ApiError` behavior.

## Resource lifecycle coverage

The P7 browser matrix covers role/status visibility and session expiry,
cross-tenant project/member isolation, plain and secret variable masking,
stale and duplicate conflicts, reference-safe variable deletion, member role
changes, duplicate/stale membership recovery, and final project-manager
protection. Browser evidence is sanitized to paths/status/problem codes only;
credentials, cookies, bearer values, OTPs, request bodies, and response bodies
are excluded.

## Verification

```powershell
npm --prefix frontend test -- --run src/lib/api.test.ts src/features/auth/AuthProvider.test.tsx
npm --prefix frontend run lint
npm --prefix frontend run typecheck
.\backend\mvnw.cmd -f backend\pom.xml -B -DskipITs '-Dtest=AdminUserServiceTest' test
```

The live acceptance commands and the canonical sanitized manifest are recorded
in [`100-phase7-authorization-resource-lifecycle.md`](../testing/100-phase7-authorization-resource-lifecycle.md).

The frozen plan's AC1 and AC6 command contract still invokes the local evidence
adapter with `-Kind security-test`, while its proof map requires the normalized
`integration-test` kind. The adapter therefore supports the process-scoped
`LOCAL_EVIDENCE_KIND_OVERRIDE=integration-test` compatibility switch; it is
unset by default and changes neither the command contract nor ordinary evidence
emission.

The retained phase-5 browser checks use the current confirmation-dialog and
per-user feedback contracts for administrator role/status changes; this keeps
the regression suite aligned with the P7 security UI while preserving its
authorization assertions. The role matrix also retains the read-only Members
navigation for every project member, as required by the workspace contract.

Formal P7 completion is recorded as PASS in the milestone ledger with six
receipt-backed acceptance criteria and the sanitized 14-case browser manifest.
