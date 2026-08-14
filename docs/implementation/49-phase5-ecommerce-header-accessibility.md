# Phase 5 ecommerce header accessibility and control contract

## Problem

The shared ecommerce header contained several controls that were difficult to identify or did not perform an action: the search field had no programmatic label, the icon-only search/cart/menu controls had no stable accessible names, category shortcuts only logged to the console, and promotional shortcuts presented as active buttons without an implemented destination.

## Implementation

- `frontend/src/components/layout/Header.jsx` now forwards standard button and input attributes so labels, expanded state, busy state, and relationships are represented in the DOM.
- The header search field has the stable label `Tìm kiếm sản phẩm`, an ID, and visible focus styling. Its submit button is named `Tìm kiếm`.
- Categories, account, and shop menus expose `aria-expanded`, `aria-controls`, and labelled menu containers. Category shortcuts are real links to `/search?q=...` instead of console-only buttons.
- Authenticated cart and message links expose names that include their current counts. The anonymous login link, account menu, and mobile menu button remain discoverable when their visible text is hidden at smaller widths.
- Mobile category cards use real links and preserve the category name in route state.
- App download, connection, promotion, trend, hot-deal, and mobile “other” shortcuts are explicitly disabled and titled `Tính năng sắp có` until their destinations exist; they are no longer advertised as functioning actions.

## Why this approach

Native links and buttons provide keyboard activation, focus management, and screen-reader semantics without custom key handlers. `aria-expanded` and `aria-controls` expose the state of the existing disclosure menus while leaving the current visual design and click-outside behavior intact. Explicitly disabling unfinished controls is safer than allowing a click that silently does nothing.

## Verification

The opt-in ecommerce browser contract now includes a header journey that checks the named search field, search button, login link, disclosure state, and a working `Áo thun` category shortcut. After rebuilding the local storefront, all 12 ecommerce smoke scenarios passed. The ecommerce production build and 11 unit tests also passed.

## Remaining scope

This slice closes the shared-header/control portion of QG-006. The overall ecommerce accessibility gate is still open: the previous Lighthouse score must be rerun after the broader form, dialog, contrast, mobile, and unfinished-route work is complete, and the release threshold remains 95.
