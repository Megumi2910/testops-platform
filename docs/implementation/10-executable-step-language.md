# Executable Step Language

Test cases are stored as data. The backend validates that data, and `PlaywrightCaseRunner` interprets it. This document explains the syntax and the reason behind each field.

## 1. The case shape

A case is an aggregate with metadata and ordered steps. Conceptually:

```json
{
  "name": "Search for a product",
  "description": "Verify that a known product can be found.",
  "status": "READY",
  "priority": "HIGH",
  "tags": "search,smoke",
  "retryCount": 1,
  "dataIsolation": true,
  "steps": [
    {
      "position": 0,
      "action": "NAVIGATE",
      "inputValue": "/"
    },
    {
      "position": 1,
      "action": "FILL",
      "locatorType": "ROLE",
      "locatorRole": "TEXTBOX",
      "locatorValue": "Search",
      "inputValue": "keyboard"
    },
    {
      "position": 2,
      "action": "CLICK",
      "locatorType": "ROLE",
      "locatorRole": "BUTTON",
      "locatorValue": "Search"
    },
    {
      "position": 3,
      "action": "ASSERT_TEXT_CONTAINS",
      "locatorType": "TEXT",
      "locatorValue": "keyboard",
      "expectedValue": "keyboard"
    }
  ]
}
```

The exact DTO is [`ProjectDtos.CaseRequest`](../backend/src/main/java/com/megumi/testops/project/api/ProjectDtos.java), and the interpreter is [`PlaywrightCaseRunner`](../backend/src/main/java/com/megumi/testops/execution/runner/PlaywrightCaseRunner.java).

## 2. Case fields

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Required case name, max 200 characters. Unique within a suite. |
| `description` | string | Optional explanation, max 4000 characters. |
| `status` | enum-like string | `DRAFT`, `READY`, or `ARCHIVED`. |
| `priority` | enum-like string | `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. |
| `tags` | string | Optional comma/tag text used for classification. |
| `retryCount` | integer | Number of attempts after the first, from 0 to 5. |
| `dataIsolation` | boolean | Declares that the case expects isolated data/browser state. Defaults to true. |
| `projectVersion` | integer | Optional optimistic-concurrency version. |
| `steps` | array | Ordered `StepRequest` objects. |

Only `READY` cases are eligible for execution. A draft can be edited while incomplete; an archived case remains in history but is excluded from normal suite listings and runs.

## 3. Step fields

| Field | Type | Meaning |
| --- | --- | --- |
| `position` | integer | Zero-based order. Must be unique and contiguous. |
| `action` | string | Canonical browser action or assertion. |
| `locatorType` | string | How to find the target element. |
| `locatorValue` | string | The value passed to the locator strategy. |
| `locatorRole` | string | ARIA role when `locatorType` is `ROLE`. |
| `inputValue` | string | URL, text, select value, or interpolated input. |
| `expectedValue` | string | Expected text or URL fragment for assertions. |
| `timeoutMs` | integer | Per-step timeout, from 100 to 120000 ms. |

Not every field applies to every action. The backend rejects combinations that cannot be interpreted safely.

## 4. Supported actions

The supported action set is declared in [`DefinitionService`](../backend/src/main/java/com/megumi/testops/project/service/DefinitionService.java) and exposed to the frontend through `/api/v1/platform/options`.

| Action | Required data | Playwright behavior |
| --- | --- | --- |
| `NAVIGATE` | `inputValue` | Resolves a relative/absolute URL through `ExecutionTargetGuard`, then calls `page.navigate`. |
| `CLICK` | locator | Calls `locator.click`. |
| `FILL` | locator + `inputValue` | Calls `locator.fill`. |
| `CLEAR` | locator | Fills the locator with an empty string. |
| `SELECT_OPTION` | locator + `inputValue` | Selects an option value. |
| `CHECK` | locator | Checks a checkbox. |
| `UNCHECK` | locator | Unchecks a checkbox. |
| `PRESS` | locator + `inputValue` | Sends a keyboard key such as `Enter`, `Tab`, or `ArrowDown` to the locator. |
| `HOVER` | locator | Hovers the pointer over a control so menus and tooltips can appear. |
| `WAIT_VISIBLE` | locator | Waits for `VISIBLE`. |
| `WAIT_HIDDEN` | locator | Waits for `HIDDEN`. |
| `ASSERT_TEXT_EQUALS` | locator + `expectedValue` | Asserts exact text. |
| `ASSERT_TEXT_CONTAINS` | locator + `expectedValue` | Asserts contained text. |
| `ASSERT_VISIBLE` | locator | Asserts visibility. |
| `ASSERT_HIDDEN` | locator | Asserts hidden state. |
| `ASSERT_VALUE` | locator + `expectedValue` | Asserts the value of an input, select, or textarea. |
| `ASSERT_CHECKED` | locator | Asserts that a checkbox or radio control is checked. |
| `ASSERT_ENABLED` | locator | Asserts that a control accepts interaction. |
| `ASSERT_DISABLED` | locator | Asserts that a control is disabled. |
| `ASSERT_ATTRIBUTE` | locator + `inputValue` + `expectedValue` | Treats `inputValue` as the attribute name and asserts its value equals `expectedValue`. |
| `ASSERT_COUNT` | locator + non-negative integer `expectedValue` | Asserts the number of matching elements. |
| `ASSERT_URL_CONTAINS` | `expectedValue` | Asserts the page URL contains the expected fragment. |
| `ASSERT_URL_EQUALS` | `expectedValue` | Resolves a path against the project target and asserts the complete URL equals it. |
| `TAKE_SCREENSHOT` | none | Captures a page screenshot in memory. |

The current source also accepts legacy aliases and normalizes them:

| Input alias | Canonical action |
| --- | --- |
| `SELECT` | `SELECT_OPTION` |
| `ASSERT_TEXT` | `ASSERT_TEXT_CONTAINS` |
| `WAIT` with a locator | `WAIT_VISIBLE` |

An unqualified `WAIT` is intentionally not a complete modern action. A `READY` case containing one must be edited to `WAIT_VISIBLE` or `WAIT_HIDDEN`.

## 5. Locator types

| `locatorType` | Required fields | Playwright API |
| --- | --- | --- |
| `ROLE` | `locatorRole`, `locatorValue` | `page.getByRole(ariaRole, { name })` |
| `LABEL` | `locatorValue` | `page.getByLabel(value)` |
| `TEST_ID` | `locatorValue` | `page.getByTestId(value)` |
| `TEXT` | `locatorValue` | `page.getByText(value)` |
| `PLACEHOLDER` | `locatorValue` | `page.getByPlaceholder(value)` |
| `ALT_TEXT` | `locatorValue` | `page.getByAltText(value)` |
| `TITLE` | `locatorValue` | `page.getByTitle(value)` |
| `CSS` | `locatorValue` | `page.locator(value)` |
| `XPATH` | `locatorValue` | `page.locator("xpath=" + value)` |

The preferred locators are generally semantic ones (`ROLE`, `LABEL`, `TEST_ID`, `TEXT`) because they describe user-visible behavior and are less coupled to layout than CSS/XPath. CSS and XPath remain supported for target elements that do not expose a stable accessible or test identifier.

For a `ROLE` locator, `locatorRole` is translated through an allowlist:

```text
BUTTON, LINK, CHECKBOX, COMBOBOX, HEADING, TEXTBOX
```

The role name and accessible name are separate values:

```json
{
  "locatorType": "ROLE",
  "locatorRole": "BUTTON",
  "locatorValue": "Add to cart"
}
```

## 6. Validation rules

Before a case is saved, `DefinitionService` checks:

1. Action is supported after normalization.
2. Locator action has both locator type and locator value.
3. Locator type is supported.
4. `NAVIGATE` has `inputValue`.
5. Text/URL/state assertions have `expectedValue` where their descriptor says it is required.
6. `PRESS` has a keyboard input; `ASSERT_ATTRIBUTE` has an attribute name in `inputValue` and an expected value; `ASSERT_COUNT` is a non-negative integer.
7. Step count is at most 100.
8. Positions are `[0, 1, 2, ...]` with no duplicates.
9. `READY` cases do not contain legacy unqualified `WAIT`.

This is aggregate validation: the service validates the whole case before committing its replacement step list.

## 7. URL and target safety

`NAVIGATE` does not mean “visit any URL.” The project stores one target origin, and [`ExecutionTargetGuard`](../backend/src/main/java/com/megumi/testops/execution/runner/ExecutionTargetGuard.java) enforces:

- HTTP or HTTPS only;
- no user credentials in the URL;
- same scheme, host, and effective port as the project origin;
- no localhost or `.local` hosts;
- no loopback, link-local, site-local, multicast, or any-local address;
- failed DNS resolution is rejected.

Relative paths are resolved against the project origin:

```text
project origin: https://shop.example.test
step input:     /search?q=keyboard
resolved URL:   https://shop.example.test/search?q=keyboard
```

This prevents a test definition from being used as a general-purpose server-side request proxy.

## 8. Variable interpolation

Input, expected, locator, and navigation values can contain placeholders matching:

```text
${VARIABLE_NAME}
```

The variable name must start with a letter and contain letters, digits, or underscores. The runner uppercases the name before lookup:

```json
{
  "action": "FILL",
  "locatorType": "LABEL",
  "locatorValue": "Email",
  "inputValue": "${TEST_EMAIL}"
}
```

The runner resolves all four fields into one step definition before calling Playwright. If a placeholder is unavailable, execution fails rather than substituting an empty value. This is an intentional fail-closed behavior.

Each queued case also receives immutable, non-secret generated values:

| Placeholder | Value | Stability |
| --- | --- | --- |
| `${RUN_ID}` | Execution UUID | Same for every case and retry in one run. |
| `${CASE_RESULT_ID}` | Case-result UUID | Same for every retry of that case. |
| `${RUN_TIMESTAMP}` | Queue-time execution timestamp in ISO-8601 format | Same for every case and retry in one run. |

Generated values are derived inside `ExecutionRunService`, override any conflicting project-variable key, and do not suppress screenshots or traces. They can be used in input, expected value, locator value, and navigation URL fields just like ordinary variables.

## 9. Timeout behavior

There are two timeout layers:

1. `EXECUTION_DEFAULT_STEP_TIMEOUT` supplies a default for an individual step.
2. `EXECUTION_MAX_DURATION` supplies a total deadline for a case run.

A step can override the default with `timeoutMs`. A timeout is captured as an execution failure; the surrounding runner classifies Playwright/target/timeout problems as infrastructure errors where appropriate.

## 10. Retry behavior

The case’s `retryCount` controls attempts. The run service retries only when `PlaywrightCaseRunner.Result.infrastructureError()` is true. Functional assertion failures are not blindly retried because repeating a deterministic product failure does not make it more trustworthy.

Example:

```text
retryCount = 2
maximum attempts = 1 initial attempt + 2 retries = 3
```

The persisted `attemptCount` shows how many attempts actually started.

## 11. Result semantics

For each case, the runner returns a result object containing:

```text
passed
errorMessage
screenshot bytes (when allowed)
secretBearing flag
infrastructureError
trace path (when tracing was enabled)
```

The run service maps it to:

```text
passed = true                    → PASSED
passed = false, infrastructure  → ERROR
passed = false, functional      → FAILED
```

Each step result records a position, action, status, duration, and optional error message. The current implementation marks the terminal failing step as failed when the runner returns an unsuccessful outcome; step-level duration persistence remains a foundation that can be made more granular as the runner evolves.

## 12. Authoring guidance

Prefer a case that reads like a user journey:

```text
NAVIGATE
  → WAIT_VISIBLE page landmark
  → FILL search field
  → CLICK search button
  → ASSERT_TEXT_CONTAINS result
```

Good step definitions:

- use one action per step;
- use accessible roles/labels or stable test IDs;
- use short explicit assertions;
- set a narrower timeout only when the target behavior requires it;
- keep destructive checkout/order flows isolated and use safe test data;
- keep credentials out of plain input values and artifacts.

Fragile step definitions:

- depend on generated CSS class names;
- use XPath tied to a deep DOM tree;
- navigate to a different host;
- use an unqualified `WAIT` in a `READY` case;
- assert large blocks of unstable text;
- depend on shared cart/account state without cleanup.

## 13. Where to change the language

If you add or change an action, inspect and update all of these locations:

1. `DefinitionService.ACTIONS` and validation rules.
2. `PlatformOptionsController` supported-action response.
3. `PlaywrightCaseRunner.execute`.
4. Frontend step editor options and types. The editor reads action descriptors from `/api/v1/platform/options`; labels and placeholders for key, attribute, count, value, and URL assertions are action-specific.
5. Backend tests for accepted/rejected definitions.
6. Frontend tests for the authoring UI.
7. This reference and the API/data documentation.

If you add a locator type, update:

1. backend locator allowlist;
2. backend locator resolver;
3. platform options response;
4. frontend selector UI;
5. validation tests;
6. documentation.
