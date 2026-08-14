# Phase 5 — Ecommerce review eligibility

## Why this slice exists

The product page previously showed the review composer to every authenticated account. The backend correctly rejected users who had not bought the product, but the UI gave those users an action that could never succeed. This slice moves the eligibility decision to the backend and keeps the browser state aligned with the same rules used when a review is created.

## Decision flow

1. `ProductReviews` loads the public reviews and, for an authenticated user, asks for both existing-review state and eligibility.
2. `GET /api/reviews/product/{productId}/eligibility` returns only a boolean. It requires a verified customer or administrator and does not disclose order identifiers.
3. `ReviewServiceImpl.canUserReviewProduct` rejects null identifiers, an existing review, or a user without a completed order line for the product.
4. The existing create-review endpoint repeats the purchase and duplicate checks. The eligibility endpoint is therefore a UI hint, not a security boundary.
5. The UI shows the composer only when both checks pass. Non-purchasers see purchase guidance and cannot submit a review form.

## Regression coverage

The opt-in browser contract is `frontend/e2e/phase5-ecommerce-reviews.spec.ts`. It uses the isolated ecommerce fixture stack and proves that:

- a completed purchaser can create a verified-purchase review;
- the same user receives a duplicate-review validation response and loses eligibility after creation; and
- a different customer cannot create a review and does not see the composer.

The test deletes its QA-owned review in a `finally` block. Credentials are supplied through environment variables and are never committed.

## Local verification

```powershell
cd D:\Projects\ecommerce-web\webcky\backend
.\mvnw.cmd -B '-Dtest=ReviewServiceEligibilityTest' test

cd D:\Projects\ecommerce-web\webcky\frontend
npm test -- --watchAll=false --runInBand

cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_E2E_BASE_URL='http://localhost:3101'
$env:ECOMMERCE_E2E_REVIEWS='true'
$env:ECOMMERCE_E2E_CUSTOMER_PASSWORD='MockCustomer!123'
$env:ECOMMERCE_E2E_CUSTOMER_B_PASSWORD='MockCustomerB!123'
npx playwright test e2e/phase5-ecommerce-reviews.spec.ts --workers=1 --reporter=line
```

GitHub Actions cannot currently be used because the account has consumed its included monthly Actions minutes. The local commands above are the evidence for this slice until the quota resets or billing is changed.
