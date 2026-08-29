# Pre-merge navigation hit-target and disclosure hardening

## Outcome

The responsive shell keeps its established navigation and account-menu logic
while making the controls materially easier to activate. Icon buttons now meet
the `44×44` CSS-pixel touch-target baseline, account activation has the same
minimum height, and visible SVG/text children cannot intercept the parent
button's click.

## Interaction contract

- The hamburger declares `aria-controls="site-navigation"` and preserves its
  existing expanded state, dialog, focus trap, Escape, scroll lock, and
  backdrop behavior.
- The account trigger retains its menu relationship and now exposes a compact
  visual disclosure that rotates with `aria-expanded`.
- At the `801px` desktop boundary, the account display name becomes a compact
  ellipsis target while its complete accessible name remains on the trigger.
  This prevents desktop-navigation overflow without removing the named region.
- The avatar, display name, Account label, and hamburger SVG use
  `pointer-events: none`; the semantic native button remains the one and only
  activation surface.

This avoids duplicating click handlers or changing routing behavior. It is a
targeted accessibility and affordance correction, not a navigation redesign.

## Source and verification

`frontend/src/components/AppShell.tsx` carries the stable navigation ID and
semantic relationships. `frontend/src/styles.css` owns target sizing,
expanded-state feedback, and child hit-testing. Mounted and Playwright tests
exercise child-coordinate clicks at `320`, `390`, `800`, and `801` pixels; the
test record is documented in
[`105-premerge-navigation-accessibility.md`](../testing/105-premerge-navigation-accessibility.md).
