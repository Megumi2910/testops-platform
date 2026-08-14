# Problem responses and DRAFT case validation

## Outcome

This Phase 2 slice resolves `QG-001` and `QG-002`. A case in `DRAFT` can now retain incomplete work, while a transition to `READY` still enforces an executable definition. Expected domain and request-validation failures use one structured problem response instead of becoming generic `500` errors.

## Why the failure occurred

`DefinitionService` previously ran the same action-completeness checks whenever steps were replaced. That made a partially configured `NAVIGATE` step invalid even when the case remained `DRAFT`. The resulting `ApiException` was then intercepted by the authentication advice's broad `Exception` handler, which hid the real `400 input_required` failure behind `500 internal_error`.

## Validation model

The backend remains authoritative and applies two levels of validation:

- `DRAFT` validates structure: recognized actions, ordered positions, supported values when supplied, and configured limits. Fields required only for execution may remain empty.
- `READY` validates execution completeness: the case must contain steps, begin with `NAVIGATE`, and provide every field required by each action.

Create and update canonicalize the requested status before replacing steps, so the correct policy is used consistently. Error paths include the zero-based step position, for example `steps[0].inputValue`.

## Standard problem contract

`ApiProblem` is now shared by authentication and domain endpoints:

```json
{
  "type": "about:blank",
  "title": "Invalid request",
  "status": 400,
  "code": "input_required",
  "detail": "This action requires an input value",
  "instance": "/api/v1/projects/.../cases/...",
  "correlationId": "qa-ready-contract",
  "errors": [
    {
      "path": "steps[0].inputValue",
      "code": "input_required",
      "message": "This action requires an input value",
      "stepPosition": 0
    }
  ]
}
```

`ApiExceptionHandler` owns domain, bean-validation, and unexpected failures. `AuthExceptionHandler` handles only `AuthException`, preventing advice ordering from changing domain errors. Unexpected exception details are not returned to clients. Correlation IDs are preserved or generated for support tracing.

The frontend normalizer accepts the canonical `errors[]` array and the prior map shape for one compatibility period. Builder controls will consume the paths directly in the later guided-authoring slice.

## Verification

- Backend focused tests cover incomplete DRAFT persistence, READY rejection, domain problem mapping, bean-validation mapping, and unexpected-error sanitization.
- Frontend tests cover canonical and compatibility error normalization.
- After rebuilding the containers from the working tree, Chrome DevTools saved the original partial DRAFT successfully.
- An authenticated READY update of the same definition returned `400 input_required` with `errors[0].path = steps[0].inputValue` and never produced a `500`.

## Regression ownership

- Backend unit tests own status-aware definition rules.
- MVC advice tests own HTTP status, stable code, field path, step position, and correlation ID behavior.
- Frontend API tests own response normalization.
- The Phase 4 builder tests will own focus and inline rendering for these server paths.
