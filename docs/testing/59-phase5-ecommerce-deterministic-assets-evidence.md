# Phase 5 ecommerce deterministic-assets evidence

## Acceptance checks

| Check | Result |
| --- | --- |
| Homepage banner images | Served from the frontend origin via local SVG assets |
| About-page imagery | Served from the local team illustration |
| Category fallback | Uses the checked-in `default-category.jpg` |
| Mock product images | Seeder returns same-origin `/assets/mock-*.svg` paths and normalizes existing fixture rows |
| Font loading | No Google Fonts import; system stack is used |
| Banner actions | `Mua ngay` reaches `/search`; `Khám phá` reaches `/categories` |
| External image/style/font requests | `[]` in the Playwright network allowlist assertion |

## Commands and results

```powershell
cd D:\Projects\ecommerce-web\webcky\backend
.\mvnw.cmd -B test
# 17 tests passed

cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_BASE_URL='http://localhost:3001'
$env:ECOMMERCE_SMOKE_EMAIL='mock.customer@example.test'
$env:ECOMMERCE_SMOKE_PASSWORD='MockCustomer!123'
npm run e2e -- ecommerce-smoke.spec.ts
# 13 passed
```

The first rebuilt seeder attempt exposed an immutable `List.of` replacement error in Hibernate. The fixture now copies image lists into mutable `ArrayList` instances; the next rebuild completed and logged the ready message. This regression is documented because silently continuing after a failed seed would make the visual gate misleading.
