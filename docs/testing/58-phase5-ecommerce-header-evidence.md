# Phase 5 ecommerce header accessibility evidence

## Browser contract

The `header navigation exposes named controls and working category links` scenario in `frontend/e2e/ecommerce-smoke.spec.ts` verifies:

1. The home page exposes a textbox named `Tìm kiếm sản phẩm`.
2. The search submit control is named `Tìm kiếm`.
3. The anonymous account link is named `Đăng nhập`.
4. The desktop category disclosure reports `aria-expanded=false`, changes to `true` after activation, and exposes a `menuitem` named `Áo thun`.
5. Activating that menu item reaches `/search?q=Áo%20thun`.

## Results

After rebuilding the ecommerce frontend container from the semantic catalog commit plus the header slice:

- `npm run build`: passed.
- Ecommerce unit tests: 4 suites, 11 tests passed.
- TestOps opt-in ecommerce smoke contract: 12/12 scenarios passed in 28.9 seconds.

The existing React test suite still prints non-failing React Router and `act` deprecation warnings. They are recorded as maintenance work rather than test failures.

## Rerun command

```powershell
cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_BASE_URL='http://localhost:3001'
$env:ECOMMERCE_SMOKE_EMAIL='mock.customer@example.test'
$env:ECOMMERCE_SMOKE_PASSWORD='MockCustomer!123'
npm run e2e -- ecommerce-smoke.spec.ts
```

GitHub Actions cannot currently provide remote evidence because the account has exhausted its included Actions minutes. The local Docker/browser result is authoritative for this slice; the remote gate must be rerun after the quota resets or billing is changed.
