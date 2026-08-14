# Guided case authoring recovery

## Outcome

This Phase 4 slice makes the three-stage case builder preserve useful metadata, map backend validation to the correct control, and recover safely when queueing fails after a successful READY save. It does not change the backend API.

## Source ownership

| Concern | Source |
| --- | --- |
| Details → Steps → Review workflow | `frontend/src/features/projects/GuidedCasePage.tsx` |
| Existing-case editing | `frontend/src/features/projects/CasePage.tsx` |
| Stable step identities and server-path mapping | `frontend/src/features/projects/caseBuilder.ts` |
| Backend-owned action metadata | `frontend/src/features/projects/api.ts` and `/api/v1/platform/options` |
| Mounted regression coverage | `frontend/src/features/projects/GuidedCasePage.test.tsx` |

## Details stage

The Details stage exposes priority, retry count, comma-separated tags, and data isolation. Retry count is limited to `0..5`. A case name is required before moving to Steps, including for a DRAFT, because names identify definitions and participate in active-name uniqueness.

Validation uses React Hook Form as the local interaction layer. `trigger('name', { shouldFocus: true })` both prevents the stage transition and moves keyboard focus to the invalid field. The backend remains authoritative when the form is submitted.

When the server returns `case_name_taken`, the builder:

1. stays on Details;
2. attaches the conflict to Name;
3. focuses Name;
4. offers an explicit `(<original> (copy))` suggestion without silently renaming the definition.

## Step-specific server errors

The API problem contract can return paths such as `steps[2].locatorRole`. Editable steps use stable client IDs so reordering does not detach messages from their rows. `mapServerStepErrors` translates the server array position into the current step's stable ID, and both new-case and existing-case editors pass that map to `GuidedStepEditor`.

The mapping deliberately ignores non-step fields. Name errors stay with React Hook Form, while general failures remain in the page alert.

## Save modes and queue recovery

- **Save draft** persists incomplete work under the backend's DRAFT rules.
- **Save as READY** runs complete local step checks, then the backend repeats authoritative validation.
- **Save & run** creates the READY definition and queues it as one user action.

If READY creation succeeds but queueing fails, the response still contains the saved case. The builder retains that identity and offers **Open saved case** and **Retry run**. Retrying calls only the queue endpoint; it never creates a duplicate case or loses the user's saved definition.

All mutations use React Query's pending state to disable repeated submission. Existing-case editing exposes the same retry, tag, and isolation fields and maps server violations back to the same controls.

## Review semantics

Review is a static summary, not another editor. It shows:

- case name;
- step count and ordered action summaries;
- priority and retry count;
- isolated/shared context policy;
- tags when present.

The user returns to Steps to edit actions. This avoids multiple competing form representations of the same definition.

## Verification evidence

- Frontend lint: pass.
- Frontend typecheck: pass.
- Frontend unit tests: 26 passed across 8 files.
- Frontend production build: pass, including the container build.
- Chrome DevTools desktop:
  - backend-owned metadata rendered;
  - empty Name blocked the transition and received focus;
  - template steps remained available at Steps;
  - Review showed `2 retries`, `isolated context`, `P0, smoke`, and three static step summaries;
  - no QA record was saved during this read-only flow.

Chrome DevTools initially showed focus remaining on **Continue to steps**. The implementation changed to an explicit focused trigger and the mounted test now asserts `Name` has focus. The retest passed.

## Remaining Phase 4 work

This slice does not yet implement a Compare/Retry optimistic-lock experience, server-backed OTP resend cooldown/idempotency, or dashboard aggregate-query replacement. Those remain separate scoped slices so each can receive focused tests, documentation, publication, and CI evidence.
