# Phase 7 artifact preview accessibility evidence

## Scope

This slice covers the screenshot preview transition on an execution detail
page. Trace downloading, artifact authorization, evidence redaction, and the
full Chrome DevTools accessibility/performance matrix remain separate gates.

## Automated coverage

| Scenario | Expected contract | Local result |
| --- | --- | --- |
| Screenshot succeeds | A named dialog contains the screenshot preview | PASS |
| Preview opens | Focus moves to **Close preview** | PASS |
| Escape is pressed | Preview closes without navigating away | PASS |
| Preview closes | Focus returns to **Preview screenshot** | PASS |

The test activates the preview button after explicitly focusing it, matching
keyboard activation and real browser click behavior. This makes focus
restoration deterministic in jsdom and prevents a false green result caused by
`fireEvent.click` not automatically moving focus.

## Commands

```text
cd frontend
npm test -- --run src/features/executions/ExecutionPages.test.tsx   PASS (3 tests)
npm run lint                                                     PASS
npm run typecheck                                                PASS
npm test -- --run                                               PASS (21 files / 66 tests)
npm run build                                                    PASS
```

Remote CI run
[`31862272093`](https://github.com/Megumi2910/testops-platform/actions/runs/31862272093)
passed all six required jobs: frontend, backend, containers, enabled E2E,
local-target-disabled E2E, and browser-crash E2E. The run emitted only the
non-blocking `upload-artifact` Node.js 20 deprecation annotation. The final
Chrome DevTools desktop/tablet/320×800 accessibility and performance matrix
remains a release-level follow-up.

## Regression ownership

- Implementation: `frontend/src/features/executions/ExecutionPages.tsx`
- Mounted regression: `frontend/src/features/executions/ExecutionPages.test.tsx`
- Browser follow-up: verify dialog focus in Chrome DevTools at desktop,
  tablet, and `320×800`, including screen-reader tree and no horizontal
  overflow.
