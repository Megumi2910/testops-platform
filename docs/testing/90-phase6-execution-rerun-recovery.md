# Test evidence — execution rerun and cancellation recovery

## Automated coverage

`frontend/src/features/executions/ExecutionPages.test.tsx` now verifies:

1. A failed execution with a suite ID shows **Run current suite again** to a
   project member with `EXECUTION_START`.
2. Clicking the action calls the suite queue API with the project and suite
   identifiers and disables the control while the request is pending.
3. The action is absent when the project does not grant `EXECUTION_START`.
4. Existing list/detail/artifact retry behavior remains covered.

## Commands and results

| Gate | Result |
| --- | --- |
| Focused execution tests | PASS — 5 tests |
| Frontend lint | PASS |
| Frontend typecheck | PASS |
| Frontend unit suite | PASS — 21 files / 72 tests |
| Frontend production build | PASS |

## Manual regression checklist

- Open a terminal execution that belongs to an active suite as a project
  manager or tester with `EXECUTION_START`.
- Confirm the action appears beside **Back to runs**.
- Click once and confirm it becomes busy; do not submit a second request.
- Confirm the browser navigates to the new execution detail after the `202`
  queue response.
- Repeat as a viewer or member without `EXECUTION_START`; the action must not
  appear.
- Repeat for an archived project or suite; the action must remain unavailable
  or show the backend's sanitized rejection with a retry option.
- Start a non-terminal run, disconnect the backend, and use the cancellation
  retry. No token, cookie, secret, or stack trace should appear in the UI.

## Release interpretation

These are source and mounted-component results. They do not replace the live
Chrome DevTools role/viewport matrix or the rebuilt-container execution gate.
