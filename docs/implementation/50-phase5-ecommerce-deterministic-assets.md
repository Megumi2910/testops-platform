# Phase 5 ecommerce deterministic visual assets

## Problem

The storefront loaded Google Fonts, Unsplash banners, remote About-page images, and remote image URLs from the permanent mock catalog. A local browser run could therefore change appearance, timing, or failure behavior based on internet availability.

## Implementation

- Added local SVG artwork under `frontend/src/assets/` for the three homepage banners and About-page team illustration.
- Added public mock product illustrations under `frontend/public/assets/` so backend fixture URLs can use stable same-origin paths.
- Replaced remote banner, About-page, category fallback, and Google Font references. The application now uses a system font stack and local fallback assets.
- Updated `MockDataSeeder` to assign `/assets/mock-shirt.svg`, `/assets/mock-audio.svg`, and `/assets/mock-bottle.svg` to the stable fixture SKUs. Existing fixture rows are normalized on restart; mutable `ArrayList` values avoid Hibernate's immutable-collection replacement failure.
- Banner actions now navigate to real `/search` or `/categories` destinations instead of `#`.

## Why this approach

SVG is small, deterministic, reviewable source code and avoids committing generated binary photography. Public assets give the backend a stable URL contract without depending on CRA's content-hashed import names. The seeder updates only the known `MOCK-*` products, preserving unrelated user-created catalog data while making the permanent QA catalog repeatable.

## Verification

- Ecommerce backend tests: 17 passed.
- Clean rebuild completed and backend logged `Development mock data is ready`.
- Ecommerce production build completed.
- The browser network-allowlist assertion found no external image, stylesheet, or font requests on the homepage.
- Ecommerce smoke contract: 13/13 scenarios passed, including the actionable banner journey.

## Remaining scope

QG-008's external-asset defect is resolved for the storefront source and permanent fixtures. Performance and accessibility scores still require a fresh Lighthouse run after all remaining route-level work.
