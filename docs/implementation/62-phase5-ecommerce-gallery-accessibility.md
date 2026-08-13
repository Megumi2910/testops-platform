# Phase 5 — Ecommerce product-gallery accessibility

## Defect

The product gallery used clickable images and icon-only arrow/close buttons. Mouse users could zoom, but keyboard users had no named zoom action, and the overlay had no dialog semantics or focus restoration.

## Implementation

`ProductGallery` now:

- wraps the main image in a named button with a visible focus ring;
- labels previous/next arrows and thumbnail selection buttons;
- renders the zoom overlay as a named modal dialog;
- focuses the close button when the dialog opens;
- closes on Escape or backdrop click; and
- restores focus to the opening image button after close.

The close glyph is now a plain decorative `×` instead of a misleading left-chevron icon. The existing image fallback and error handling remain unchanged.

## Regression contract

The ecommerce storefront smoke test opens a seeded product detail, activates zoom through its accessible name, asserts the dialog and close-button focus, presses Escape, and asserts both dismissal and focus restoration.
