# Phase 5 ecommerce semantic catalog navigation

## Problem

The ecommerce category and product cards looked clickable, but their primary navigation was implemented with generic `<div onClick>` containers. That made the catalog difficult to operate with a keyboard and prevented browser tests and assistive technology from identifying the destination before activation.

## Implementation

- `frontend/src/components/product/ProductCard.jsx` now renders an `<article>` with named React Router links for the product image and product information. The add-to-cart control remains a separate button, so interactive elements are not nested inside an anchor.
- `frontend/src/components/product/CategoryCard.jsx` now uses a typed `<button>` for the reusable homepage card. The existing callback contract is preserved, while browser focus, Enter, and Space activation come from the native control.
- `frontend/src/pages/CategoriesPage.jsx` now renders each category as a named React Router link with the category name in navigation state. The route remains `/category/:id` and the existing image fallback is unchanged.
- Focus-visible rings are scoped to the new links and button, preserving the storefront design while making keyboard position visible.

## Why this approach

Cards are visual groupings, not a reason to create custom keyboard event code. Native links are the correct semantic primitive when activation navigates to another route; a native button is the correct primitive for a reusable callback card whose destination is supplied by its parent. Keeping the add-to-cart button outside the product links also avoids invalid nested interactive elements and preserves independent actions.

## Verification

The opt-in `frontend/e2e/ecommerce-smoke.spec.ts` catalog journey now locates the seeded category through `getByRole('link', { name: 'Mở danh mục Thời trang' })` and the seeded product through its named product link. This proves the accessible contract rather than only matching visible text. Run it with the permanent fixture credentials and `ECOMMERCE_BASE_URL=http://localhost:3001`.

## Scope and remaining work

This slice closes semantic category/product navigation only. Header icon names, form metadata, third-party assets, full Lighthouse remediation, checkout, messaging, and role-boundary coverage remain separate Phase 5 gates.
