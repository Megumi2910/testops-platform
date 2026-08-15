# Phase 1 account-menu keyboard navigation

## Scope

This slice completes the keyboard contract for the signed-in account menu in
`frontend/src/components/AppShell.tsx`. The menu already exposed account
security, sessions, verification recovery, administration, and sign-out. The
remaining gap was predictable keyboard entry and focus containment.

## Implementation

The trigger now responds to `ArrowDown` and `ArrowUp` while focused. ArrowDown
opens the menu on its first actionable item; ArrowUp opens it on the last
actionable item. The requested initial position is stored in a ref so opening
the menu does not add a second render-only state transition.

Once open, the document-level menu handler keeps focus inside the menu:

- `Tab` from the last menu item wraps to the first item.
- `Shift+Tab` from the first item wraps to the last item.
- `ArrowDown` and `ArrowUp` move through items cyclically.
- `Home` and `End` jump to the first and last item.
- `Escape` closes the menu and restores focus to the trigger.

The handler checks the Tab boundary before the arrow-key branch. This matters
because browser keyboard events are delivered through the document listener;
an early return for unknown arrow keys would otherwise make Tab wrapping
unreachable. An empty menu is also treated as a no-op rather than attempting
to focus an undefined element.

## Why this approach

The existing menu uses native links and a button with `role="menuitem"`, so a
small document listener preserves the current component structure and avoids
introducing a new focus-management abstraction. Focus is moved only at menu
boundaries; ordinary Tab movement remains the browser's responsibility. The
trigger's ArrowUp/ArrowDown behavior follows the established menu interaction
pattern while the Escape and outside-click behavior remain unchanged.

## Regression coverage

`frontend/src/components/AppShell.test.tsx` now verifies:

1. ArrowDown opens and focuses the first item.
2. Tab wraps from the last item to the first.
3. Shift+Tab wraps from the first item to the last.
4. ArrowUp opens and focuses the last item.

The focused test command is:

```powershell
cd frontend
npm test -- --run src/components/AppShell.test.tsx
```

Full frontend lint, typecheck, unit, and build gates passed locally. The pushed
implementation commit `dfc5d36` passed all six CI jobs in run
[`31865910829`](https://github.com/Megumi2910/testops-platform/actions/runs/31865910829).
Live Chrome DevTools verification against a rebuilt container is still part of
the broader Milestone 10A release gate.
