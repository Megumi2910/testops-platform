# Phase 5 — CI remediation evidence

## Failed-run diagnosis

CI run `31857076245` passed frontend, backend, containers, local-disabled E2E,
and browser-crash E2E. The enabled E2E suite found:

- `phase5-administrator-crud.spec.ts`: the alert was actionable but omitted
  the established `final active administrator` phrase.
- `auth-recovery.spec.ts`: the password-reset flow was flaky at the handoff
  back to Sign in because the email state was lost across navigation.

## Remediation evidence

| Check | Result |
| --- | --- |
| Focused AuthPages and AdminUsersPage tests | 2 files, 8 tests passed |
| Administrator conflict message | Stable phrase retained; recovery action included |
| Reset handoff | Email carried through a non-secret query parameter |
| Password field | Not persisted or placed in the URL |
| Browser regression | Must be rerun in the next CI workflow before this slice is closed |

Focused command:

```text
npm test -- --run src/features/auth/AuthPages.test.tsx src/features/auth/AdminUsersPage.test.tsx
Test Files  2 passed
Tests       8 passed
```

## Manual acceptance

1. As the only active administrator, attempt to demote or disable the account.
2. Confirm the alert says the final active administrator cannot be changed and
   explains that another active administrator must remain.
3. Open **Forgot your password?**, request a reset code, and return to Sign in
   from both the request and confirmation stages.
4. Confirm the email is prefilled, the password is empty, and the URL contains
   no OTP or password.
5. Run the complete enabled E2E suite and confirm there is no failed or flaky
   test before continuing to the next Phase 5 slice.

This remediation does not close the broader Milestone 10A browser, account,
accessibility, or execution gates.
