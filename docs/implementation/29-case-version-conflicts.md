# Case optimistic-lock conflict recovery

## Outcome

TestOps no longer reduces a `409 stale_version` case update to a generic instruction to reload. The editor preserves the user's unsaved values, fetches the latest server definition separately, focuses a comparison panel, and requires an explicit recovery choice.

## Why this approach

Optimistic locking prevents one browser tab from silently overwriting another. Automatically refetching the case into React Query would also reset React Hook Form and the editable step rows, destroying the exact local state the user needs to compare. The recovery therefore keeps two distinct objects:

- the local form and editable steps already in the page;
- the newest `TestCase` fetched directly after `stale_version`.

The normal case query is updated only when the user chooses **Reload server version** or when **Retry my changes** succeeds.

## Source ownership

| Concern | Source |
| --- | --- |
| Detect conflict, fetch latest, reload, retry | `frontend/src/features/projects/CasePage.tsx` |
| Accessible comparison panel | `frontend/src/features/projects/CaseVersionConflict.tsx` |
| Pure difference calculation | `frontend/src/features/projects/caseConflict.ts` |
| Regression coverage | `frontend/src/features/projects/CaseVersionConflict.test.tsx` |

## Recovery choices

### Reload server version

This updates the case query cache with the fetched server object. The existing query-to-form effect then resets metadata and steps together. Local unsaved values are deliberately discarded only after this explicit action.

### Retry my changes

This resubmits the current local form and step serialization with the newly fetched server version. It is an explicit overwrite attempt, not an automatic retry. If another writer wins again, TestOps fetches the even newer version and presents comparison again.

The ordinary Save button is disabled while a conflict is unresolved. Both recovery buttons are disabled while the latest version is loading or a retry is pending.

## Comparison safety

The table contains only fields whose visible values differ. Step comparison shows the ordered action names, not locator/input/expected values. This provides useful structural context without duplicating potentially sensitive literals in a new evidence surface.

The comparison section receives programmatic focus when it appears. A horizontally scrollable wrapper contains the minimum-width table on narrow screens instead of widening the whole application.

## Live verification

Chrome DevTools used two authenticated tabs on the QA-owned partial draft:

1. Both tabs loaded the same initial version.
2. Tab B changed Description and saved with `PUT 200`.
3. Tab A changed Description and saved its stale version; the API returned `PUT 409`.
4. TestOps fetched the latest case with `GET 200` and focused the comparison region.
5. The table showed the local and server descriptions without replacing the local textbox.
6. **Retry my changes** returned `PUT 200` and removed the conflict panel.
7. A second stale edit reproduced the panel; **Reload server version** discarded only that explicit local edit.
8. The QA case description was restored to its original blank value.

No unexpected console exception or network `500` occurred. Chrome continues to report the pre-existing case-step form metadata issue tracked as `QG-005`.

## Automated verification

- Frontend lint: pass with zero warnings.
- Frontend typecheck: pass.
- Frontend unit tests: 28 passed across 9 files.
- Frontend production build: pass.
- Pure tests verify difference filtering and omission of step values.
- Component tests verify focus, the comparison table, and both explicit recovery callbacks.
