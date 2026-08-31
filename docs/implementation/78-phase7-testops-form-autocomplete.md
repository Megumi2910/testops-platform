# Phase 7 — TestOps definition-form autocomplete policy

## Outcome

Project, suite, case, target, and variable authoring controls now declare an
explicit browser-autofill policy. Personal identity fields retain semantic
tokens such as `organization` and `email`; test-definition values use
`autocomplete="off"` because they are not account credentials and can contain
selectors, URLs, generated data, or secret-variable values.

## Why this boundary matters

Chrome and assistive-technology audits treat an omitted autocomplete policy as
an ambiguous form contract. In TestOps, browser autofill is actively harmful:
it can place personal data into a case name, target origin, locator, or a
write-only secret variable. The browser should understand that these controls
belong to a test-definition workflow, not an account-credential workflow.

## Implementation

The existing labels and form components remain unchanged. The smallest safe
change is to annotate the controls at their source:

- `CasePage` marks case name and retry count as `off`; the existing tags field
  already used the same policy.
- `SuitePages` marks create/edit suite names and descriptions as `off`.
- `EditProjectPage` marks the target origin as `off`; project names retain the
  standard `organization` token.
- `VariablesPage` marks variable keys and values as `off`, including secret
  values. Secret masking and write-only API behavior are unchanged.

This deliberately avoids a global form-level override. Account forms keep
their semantic `email`, `current-password`, `new-password`, and
`one-time-code` tokens, and the member invite form keeps `email`.

## Failure and recovery behavior

Autocomplete metadata does not change validation or persistence. A malformed
target, duplicate definition name, stale version, or rejected variable still
uses the existing backend problem contract and inline recovery UI. If a browser
ignores `off`, the server remains the authority and secret values are still
never returned in clear text.

## Regression evidence

- `frontend/src/features/projects/CasePage.test.tsx` asserts case name and
  retry metadata on an archived direct-link rendering.
- `frontend/src/features/projects/VariablesPage.test.tsx` asserts variable key
  and value metadata while verifying secret masking.
- The Chrome DevTools form matrix remains a release-gate follow-up for all
  project, suite, case-builder, variable, member, and administration routes.
