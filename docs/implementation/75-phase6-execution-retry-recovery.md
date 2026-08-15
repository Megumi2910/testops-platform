# Phase 6 — Execution history and artifact retry recovery

## Outcome

Execution pages now recover in place when a list, detail, screenshot, or trace
request fails. A transient backend restart or an expired artifact no longer
leaves the operator with a dead-end error and forces a full page navigation.
The retry action is scoped to the failed request, keeps the current route, and
does not create a second execution.

## UI behavior

- The Runs page keeps its existing loading state and now renders a **Try
  again** button beside the sanitized list error.
- An execution detail page keeps the run URL and offers the same action when
  the execution record cannot be fetched. React Query refetches the exact
  execution key and shows its pending state on the button.
- Artifact actions use the shared `Button` component. The selected screenshot
  or trace is disabled while it is loading, preventing duplicate downloads.
- Artifact failures display a generic, evidence-safe message. The page stores
  only the artifact identifier and type needed to repeat the request; it does
  not render server error text, URLs, cookies, or artifact contents in the
  failure message.
- Retrying a screenshot restores the normal inline preview. Retrying a trace
  repeats the download and keeps the existing filename convention.

## Source path

The behavior lives in
`frontend/src/features/executions/ExecutionPages.tsx`:

1. `ExecutionsPage` uses `query.refetch()` for list recovery.
2. `ExecutionDetailPage` uses the same exact query key for detail recovery.
3. `loadArtifact` wraps the blob request in `try/catch/finally`, tracks the
   pending artifact, and records a sanitized retry descriptor.
4. The existing preview cleanup still revokes the object URL when a preview is
   replaced, closed, or unmounted.

This is intentionally a presentation-layer change. The backend API remains
authoritative for permissions, artifact retention, secret suppression, and
execution immutability. A retry can therefore only re-read the same execution
or artifact; it cannot mutate a queued run.

## Why the retry is request-scoped

Refreshing the whole route would discard the operator's context and can repeat
unrelated bootstrap requests. The query key identifies one project execution,
while the artifact descriptor identifies one binary resource. Keeping those
identities separate makes a failed screenshot retry predictable and avoids
accidentally replaying a run or downloading a different artifact after the
execution page has changed.

## Verification

`frontend/src/features/executions/ExecutionPages.test.tsx` covers:

- list failure → in-place retry → empty state;
- detail failure → in-place retry → execution status;
- screenshot failure → sanitized artifact error → retry → accessible preview.

The slice-local test, lint, and typecheck gates pass locally. The full frontend
suite and production build also pass, and the published CI run is recorded in
the paired testing document and the Milestone 10A ledger.
