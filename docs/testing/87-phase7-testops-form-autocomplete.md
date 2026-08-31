# Phase 7 TestOps form metadata evidence

## Scope

This slice closes QG-005 for the authenticated definition workflow. It verifies
that non-personal TestOps fields have an explicit `autocomplete="off"` policy
without changing account or member identity semantics.

## Automated coverage

| Scenario | Expected contract | Result |
| --- | --- | --- |
| Archived direct case form | Name and retry-count inputs expose `autocomplete="off"` | PASS |
| Variable authoring | Variable key/value inputs expose `autocomplete="off"` while secret values remain masked | PASS |
| Existing account forms | Email, password, and OTP controls retain semantic autocomplete tokens | PASS by existing AuthPages/AccountPages coverage |

## Commands

```text
cd frontend
npm test -- --run src/features/projects/CasePage.test.tsx src/features/projects/VariablesPage.test.tsx  PASS (2 files / 3 tests)
```

The full frontend lint, typecheck, unit, and build gates are the publication
gate for this slice. Chrome DevTools must still confirm the metadata on every
responsive definition route after the rebuilt container is running.

## Regression ownership

- Implementation: `frontend/src/features/projects/CasePage.tsx`,
  `SuitePages.tsx`, `ProjectPages.tsx`, and `ProjectResourcePages.tsx`
- Mounted regression: `CasePage.test.tsx` and `VariablesPage.test.tsx`
- Browser follow-up: inspect the accessibility/form tree for project, suite,
  case builder, variable, member, and administration routes.
