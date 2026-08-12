# Definition lifecycle browser evidence

## Scope

This record captures the Chrome DevTools journey for suite and case history-preserving deletion in the local TestOps QA project. It deliberately uses a QA-owned case name and does not reset or delete a development database.

- **Application:** TestOps Platform at `http://localhost:3000`
- **Target project:** `[QA] Primary workspace`
- **Role:** platform administrator (the same lifecycle controls are permission-gated for project managers)
- **Suite:** `[QA-RUN-20260809] Definition lifecycle`
- **Case:** `[QA-RUN-20260812] Homepage smoke`
- **Evidence date:** 2026-08-12

## Journey and observed contract

### 1. Create a draft without running it

1. Open **Projects → [QA] Primary workspace → Suites → Definition lifecycle → New case**.
2. Select the Homepage smoke template.
3. Confirm the three guided steps are present: `NAVIGATE /`, `ASSERT_VISIBLE TEXT “Danh mục sản phẩm”`, and `TAKE_SCREENSHOT`.
4. Continue through **Details → Steps → Review** and choose **Save draft**.

Observed result: `POST /api/v1/projects/{projectId}/suites/{suiteId}/cases` returned `201`, the browser opened the new case detail, the status was `DRAFT`, and **Run case** was disabled. The action catalogue exposed backend-provided options including Press, Hover, value/checked/enabled/disabled/attribute/count assertions, URL equality, and screenshot capture.

### 2. Move the case to Trash

1. Select **Move to trash** on the case detail page.
2. Verify the modal has the accessible name **Move [QA-RUN-20260812] Homepage smoke to Trash?**.
3. Verify the consequence text says the case becomes read-only and cannot run while steps and history remain available.
4. Cancel once to prove the dialog is non-destructive, then reopen and confirm.

Observed result: the focused modal exposed **Close dialog**, **Cancel**, and **Move to trash** controls. Confirmation issued `DELETE /api/v1/projects/{projectId}/suites/{suiteId}/cases/{caseId}` and returned `200`.

### 3. Verify the Trash projection

1. Follow the project **Trash** section.
2. Confirm the archived case appears under **Cases**, retains its suite name, archive time, and `ARCHIVED` badge.
3. Confirm the page explains that execution history is retained.

Observed result: `GET .../suites?lifecycle=ALL` and `GET .../cases?lifecycle=ARCHIVED` both returned `200`. The case appeared as an archived definition with a visible **Restore** action.

### 4. Restore the case as a draft

1. Select **Restore**.
2. Verify the restore modal explains that the case returns as `DRAFT` and history is preserved.
3. Keep the proposed name and choose **Restore case**.

Observed result: the modal had a labelled **Restore name** field, focusable close/cancel controls, and a restore action. `POST .../cases/{caseId}/restore` returned `200`; the page announced **Case restored successfully** and the Trash empty state appeared. Opening the suite again showed the case with a `DRAFT` badge, while the pre-existing partial draft remained unchanged.

## Network and console evidence

The journey generated no console messages. The lifecycle requests were:

| Operation | Request | Result |
| --- | --- | --- |
| Create draft | `POST .../cases` | `201` |
| Load case | `GET .../cases/{caseId}` | `200` |
| Archive | `DELETE .../cases/{caseId}` | `200` |
| List archived definitions | `GET .../suites?lifecycle=ALL` + `GET .../cases?lifecycle=ARCHIVED` | `200` |
| Restore | `POST .../cases/{caseId}/restore` | `200` |
| Reload active suite | `GET .../suites?lifecycle=ACTIVE` + `GET .../cases?lifecycle=ACTIVE` | `200` |

No authorization headers, cookies, OTPs, passwords, or tokens were captured in the committed evidence.

## Regression interpretation

- A draft can be authored and saved without accidentally becoming executable.
- Trash is a reversible, history-preserving workflow rather than destructive deletion.
- The archived definition is discoverable from a project-level page and cannot be run while archived.
- Restore is explicit, accessible, and returns an individually archived case to `DRAFT`, requiring a later READY save before execution.
- The browser contract now supports the lifecycle behavior required by QG-003 and QG-004. Remaining Phase 5 work is the broader role, conflict, project-archive, execution, and automated matrix—not this basic PM/admin lifecycle path.

## Automated regression

The same journey is repeatable in `frontend/e2e/definition-lifecycle.spec.ts`. It creates an isolated user/project/suite, saves a draft from the guided builder, asserts that a draft cannot run, verifies the `DELETE` archive response and Trash projection, restores the case, and confirms the active suite renders it as `DRAFT`. The test uses the E2E Compose target at `http://localhost:3201`, so it does not depend on the developer's ecommerce data.

Run it against the isolated stack with:

```powershell
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
$env:E2E_BASE_URL = 'http://127.0.0.1:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
$env:E2E_TARGET_ORIGIN = 'http://localhost:3201'
Push-Location frontend
npm ci
npx playwright install chromium
npm run e2e -- definition-lifecycle.spec.ts
Pop-Location
docker compose -f docker-compose.yml -f docker-compose.e2e.yml down -v
```

The isolated volume is the only volume that may be removed by this procedure. CI runs both the case and suite lifecycle tests as part of the standard enabled E2E job. The suite test additionally opens the archived direct link, proves Run/New case/Edit controls are absent, restores the suite, and confirms those controls return.

## Reproduction commands

```powershell
./scripts/setup-quality-gate.ps1
./scripts/verify-doc-links.ps1
Get-Content DOCUMENTATION-MANIFEST.json -Raw | ConvertFrom-Json | Out-Null
```

Use a fresh QA-owned prefix for every exploratory record. Do not archive or restore a user-owned definition, and never reset the normal PostgreSQL volume for browser evidence.
