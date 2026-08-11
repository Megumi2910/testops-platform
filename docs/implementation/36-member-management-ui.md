# Member management UI

## Problem found in Chrome DevTools

The project manager could open the Members page and add a user, but every existing row exposed only a status badge. The backend already supported role changes and removal, so the browser workflow was incomplete and the Phase 5 membership matrix could not be exercised from the product.

## Implemented workflow

An active project manager now sees, for every member:

- an explicitly labelled role selector;
- a `Save role` button enabled only after the role changes;
- a `Remove` button;
- an accessible confirmation dialog before removal.

Users without `MEMBER_MANAGE`, and every user viewing an archived project, continue to receive a read-only role badge with no mutation controls.

## Version and cache behavior

Every add, role update, and removal sends the current `project.version`. The backend remains authoritative for optimistic locking and the final-project-manager invariant.

After a successful mutation, the page invalidates both:

```text
['projects', projectId, 'members']
['projects', projectId]
```

Refreshing the project query is required because membership writes touch the project and advance its optimistic version. Reusing the old version would turn the next valid action into a false stale conflict.

## Error states

The member card exposes one live danger alert:

- `final_project_manager` explains that another manager must be assigned first;
- `stale_version` asks the operator to use reloaded project data;
- other failures use a safe actionable fallback without exposing server internals.

The removal dialog stays open when the request fails, preserving context. While role update or removal is pending, all row mutations are disabled to prevent overlapping writes against one project version.

## Accessibility and responsive behavior

- each selector is named `Role for <display name>`;
- removal uses the shared modal with initial focus, focus trap, Escape handling, and focus restoration;
- controls are native buttons and selects;
- long names/emails wrap instead of forcing horizontal overflow;
- action groups wrap on narrow screens;
- read-only rows use a status badge rather than disabled interactive controls.

## Regression tests

`MembersPage.test.tsx` proves:

1. role updates send the selected role and current project version;
2. removal requires confirmation and renders final-manager guidance;
3. read-only users receive no save/remove controls.

Run the focused gate:

```powershell
cd D:\Projects\testops-platform\frontend
npm test -- --run src/features/projects/MembersPage.test.tsx
npm run lint
npm run typecheck
```

Verified on 2026-08-11: 3 mounted tests passed; lint and type checking passed.

## Browser acceptance

After rebuilding only the frontend container, Chrome DevTools confirmed:

- the project manager sees four labelled role selectors and four remove buttons;
- removing the manager opens modal `Remove QA Project Manager?`, focuses its close button, and Escape closes it without mutation;
- project and member requests return `200`, with no console warning/error;
- at `320×800`, document width equals viewport width and all four save controls remain present.

The mounted viewer regression proves read-only rendering. Switching to the live viewer QA identity remains part of the continuing multi-role Chrome DevTools matrix.
