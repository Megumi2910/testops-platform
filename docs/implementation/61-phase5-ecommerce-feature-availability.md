# Phase 5 — Ecommerce feature availability labels

## Problem

The wishlist and Flash Sale routes were reachable, but their placeholder controls and countdown made them look operational even though the backend APIs were not implemented. This violated `QG-009` and made the browser matrix report a false-positive feature surface.

## Implementation

The ecommerce frontend now exports `FeatureAvailabilityNotice`, a small shared status-region component with a visible title, explanation, and screen-reader label.

- `FlashSalePage` removes the fabricated client-only countdown. With no campaign products returned, it renders a notice that the campaign API is not enabled and explicitly says no Flash Sale transaction can be completed.
- `CustomerWishlist` keeps the catalog recovery action but labels server synchronization as unavailable. Empty-list selection, filtering, and view-mode controls are disabled rather than pretending to change data.
- Wallet, voucher, and header integration controls retain their existing “coming soon”/disabled contract.

The TestOps storefront smoke contract now checks the notice text and disabled controls at both routes.

## Boundary

This does not invent wishlist or Flash Sale APIs. When those backend capabilities are added, the notice can be replaced by the real data state without changing route URLs or the smoke contract's semantic locators.
