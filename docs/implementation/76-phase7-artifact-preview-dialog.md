# Phase 7 — Accessible execution artifact preview

## Outcome

Screenshot evidence now opens as an accessible, keyboard-operable dialog-like
region instead of an unlabelled inline block. The preview remains inline on the
execution page, but it has a dialog role, a named heading, a focused close
control, Escape handling, focus containment, and focus restoration to the
button that opened it.

## Runtime behavior

When a screenshot blob resolves:

1. `ExecutionDetailPage` stores the object URL and preview name.
2. `ArtifactPreview` mounts with `role="dialog"`, `aria-modal="true"`, and an
   `aria-labelledby` reference to its heading.
3. Focus moves to **Close preview** so keyboard users receive an immediate
   recovery action.
4. Escape closes the preview. Tab remains inside the one-control preview
   surface, preventing focus from escaping behind the evidence.
5. Unmounting revokes the object URL through the existing page cleanup and
   restores focus to the original preview button.

The dialog contains no secret or server error text. Screenshot suppression and
artifact authorization continue to be decided by the backend and worker; this
slice changes presentation and keyboard semantics only.

## Source anchors

- `frontend/src/features/executions/ExecutionPages.tsx`
  - `ArtifactPreview` owns focus lifecycle and dialog semantics.
  - `ExecutionDetailPage` owns object-URL lifecycle and artifact requests.
- `frontend/src/features/executions/ExecutionPages.test.tsx`
  - verifies the named dialog, initial close-button focus, Escape close, and
    focus restoration to the invoking control.

## Design decision

The preview stays colocated with the Artifacts card rather than becoming a
global modal service. Only one binary preview can be open at a time, the
existing page context remains visible, and no new state-management dependency
is needed. The narrow focus surface is intentional: the screenshot itself is
not interactive, so the close action is the only control that needs keyboard
access.

## Verification

The focused artifact test and the complete frontend gates pass locally. Remote
CI evidence is appended to the paired testing document after publication.

