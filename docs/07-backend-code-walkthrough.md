# Backend Code Walkthrough

This document explains the Java/Spring implementation as code, including the syntax patterns that appear repeatedly and the reason each layer exists.

## 1. Backend technology and build

The backend is a Maven project in [`backend/pom.xml`](../backend/pom.xml).

| Concern | Implementation |
| --- | --- |
| Language/runtime | Java 21 |
| Web framework | Spring Boot 4.1.0, Spring MVC |
| Persistence | Spring Data JPA + Hibernate |
| Schema | PostgreSQL + Flyway |
| Authentication | Spring Security resource server, OAuth2 client, BCrypt |
| Browser automation | Playwright for Java 1.60.0 |
| Configuration | Spring `@ConfigurationProperties` records |
| Tests | JUnit 5, Spring Boot tests, Testcontainers |

The Maven dependency list is not just a list of libraries; it defines which Spring auto-configurations and APIs are available. For example:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
```

This supplies Spring Data repositories, JPA entity management, transaction integration, and Hibernate. The project still needs its own entities, repositories, migrations, and services; the starter does not create the domain model for you.

## 2. Application startup

The entry point is [`TestopsApplication.java`](../backend/src/main/java/com/megumi/testops/TestopsApplication.java):

```java
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class TestopsApplication {
    public static void main(String[] args) {
        SpringApplication.run(TestopsApplication.class, args);
    }
}
```

### What the annotations mean

- `@SpringBootApplication` combines component scanning, auto-configuration, and a Spring configuration class.
- `@ConfigurationPropertiesScan` discovers typed records such as `AuthProperties`, `PlatformProperties`, and `ProjectProperties`.
- `@EnableScheduling` activates the scheduled `ExecutionWorker.poll()` method.
- `SpringApplication.run(...)` creates the application context, constructs beans, validates configuration, starts the embedded server, and runs startup runners.

The startup sequence is approximately:

```text
Read application.yaml + environment
  → bind configuration records
  → validate configuration invariants
  → connect to PostgreSQL
  → run Flyway migrations
  → make JPA validate the migrated schema
  → register security, controllers, services, worker, and Playwright beans
  → start HTTP server
```

[`FlywayConfiguration`](../backend/src/main/java/com/megumi/testops/config/FlywayConfiguration.java) explicitly runs migrations and makes the JPA entity manager depend on the Flyway bean. This prevents Hibernate validation from racing ahead of schema migration.

## 3. Spring and Java syntax used throughout the code

### Packages

Java packages are feature-oriented:

```java
package com.megumi.testops.project.service;
```

The directory must mirror the package. This is why a file under `project/service` can refer to another project feature without putting every service in one global directory.

### Records for immutable DTOs and configuration

```java
public record ProjectRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 2000) String description,
        @NotBlank @Size(max = 2048) String targetOrigin,
        Long projectVersion) {
}
```

A record automatically supplies a final field, accessor methods (`name()` rather than `getName()`), a constructor, `equals`, `hashCode`, and `toString`. Records are a good fit for request/response data because those objects should not be changed after parsing.

### Annotations declare framework behavior

```java
@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController { ... }
```

- `@RestController` registers the class as an HTTP controller and serializes return values as JSON.
- `@RequestMapping` supplies a route prefix.
- `@GetMapping`, `@PostMapping`, `@PutMapping`, and `@DeleteMapping` map individual methods.
- `@Valid` activates Jakarta Bean Validation on a request DTO.
- `@Transactional` creates a database transaction around a service method.
- `@Transactional(readOnly = true)` documents and optimizes read paths.

### Constructor injection

The services use constructor parameters for dependencies:

```java
public ProjectService(ProjectRepository projects,
        ProjectMemberRepository members,
        ProjectAccessService access,
        ProjectTargetPolicy targets) {
    this.projects = projects;
    this.members = members;
    this.access = access;
    this.targets = targets;
}
```

Spring supplies these objects from its application context. Constructor injection makes required dependencies explicit and makes a service easy to instantiate in a unit test.

### Enum and switch expressions

```java
switch (result) {
    case PASSED -> passedCases++;
    case FAILED -> failedCases++;
    case ERROR -> errorCases++;
    case CANCELLED -> cancelledCases++;
    default -> { }
}
```

The arrow form avoids accidental fall-through. It is used for execution statuses, action normalization, and locator selection.

### `Optional`

Repository methods often return `Optional<T>`:

```java
projects.findById(id)
    .orElseThrow(() -> error(HttpStatus.NOT_FOUND,
        "project_not_found", "Project was not found"));
```

The important behavior is that absence is converted into a deliberate API error rather than a `NullPointerException` later.

### `var`, lambdas, and streams

```java
return suites.findByProjectIdAndStatusNotOrderByNameAsc(projectId, "ARCHIVED")
        .stream()
        .map(s -> new SuiteResponse(...))
        .toList();
```

- `var` lets Java infer a local variable type when the initializer is clear.
- `s -> ...` is a lambda function.
- `stream()` creates a pipeline.
- `map` converts one object shape to another.
- `toList()` materializes the result.

This is used heavily at the API boundary to convert JPA entities into DTOs without exposing entities directly.

## 4. Feature package structure

```text
feature/
├── api/          controllers and DTOs
├── config/       feature-specific configuration (auth)
├── domain/       JPA entities and enums
├── repository/   Spring Data repository interfaces
├── runner/       execution-specific browser/artifact code
└── service/      business logic and orchestration
```

The backend follows this dependency direction:

```text
api → service → repository/domain
                 ↓
             database
```

The runner is called by execution services, not directly by controllers. This is what makes the HTTP request fast and keeps browser lifecycle decisions out of HTTP code.

## 5. Configuration is typed, validated, and environment-driven

[`application.yaml`](../backend/src/main/resources/application.yaml) provides defaults and reads overrides from environment variables:

```yaml
server:
  port: ${SERVER_PORT:8080}
```

This means: use `SERVER_PORT` when present; otherwise use `8080`.

[`PlatformProperties`](../backend/src/main/java/com/megumi/testops/config/PlatformProperties.java) turns execution and target settings into typed Java values:

```java
public record Execution(
        int workerCount,
        int queueCapacity,
        Duration claimInterval,
        Duration heartbeatInterval,
        Duration staleAfter,
        Duration maxDuration,
        Duration defaultStepTimeout,
        String browser,
        boolean workerEnabled) { ... }
```

The compact constructor rejects invalid values at startup. For example, a zero worker count, non-positive timeout, or browser other than `chromium` fails fast. This is preferable to starting a partially valid service and failing during the first execution.

The same pattern appears in [`AuthProperties`](../backend/src/main/java/com/megumi/testops/auth/config/AuthProperties.java) and [`ProjectProperties`](../backend/src/main/java/com/megumi/testops/config/ProjectProperties.java).

## 6. HTTP layer: controller → DTO → service

The controller is intentionally thin:

```java
@PostMapping
@ResponseStatus(HttpStatus.CREATED)
public ProjectDtos.ProjectResponse create(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody ProjectDtos.ProjectRequest request) {
    return service.create(jwt, request);
}
```

What happens here:

1. Spring matches `POST /api/v1/projects`.
2. The JSON body is deserialized into `ProjectRequest`.
3. Bean Validation checks `@NotBlank`, `@Size`, and other annotations.
4. Spring Security supplies the authenticated JWT.
5. The service applies authorization and business rules.
6. The response record is serialized to JSON with HTTP `201 Created`.

The backend uses DTOs rather than returning JPA entities. This prevents lazy relationships, internal fields, and persistence details from becoming accidental public API.

### Error translation

[`ApiException`](../backend/src/main/java/com/megumi/testops/shared/api/ApiException.java) carries an HTTP status, stable error code, and message. [`ApiExceptionHandler`](../backend/src/main/java/com/megumi/testops/shared/api/ApiExceptionHandler.java) converts it into a JSON object:

```json
{
  "type": "urn:testops:project_archived",
  "title": "project_archived",
  "status": 409,
  "detail": "Archived projects are read-only",
  "timestamp": "2026-07-20T00:00:00Z"
}
```

The frontend accepts either `message` or `detail`, so it can handle the shared API error shape and authentication-specific problem responses.

## 7. Authentication implementation

### 7.1 Security filter chain

[`SecurityConfiguration`](../backend/src/main/java/com/megumi/testops/auth/config/SecurityConfiguration.java) configures Spring Security.

Important rules:

- Health, provider discovery, registration, email verification, login, refresh, logout, and OAuth callback routes are public.
- When `AUTH_ENABLED=true`, every other route requires authentication.
- When authentication is disabled, the local foundation permits all requests.
- JWT bearer authentication is enabled only when auth is enabled.
- OAuth2 login is registered only when a Google client registration exists.
- `TokenVersionFilter` runs after bearer authentication to check database-backed session invalidation.

The application uses stateless JWT access-token validation, but it is not completely stateless: refresh tokens, user status, and token versions are checked against PostgreSQL.

### 7.2 Registration and email OTP

[`AuthController`](../backend/src/main/java/com/megumi/testops/auth/api/AuthController.java) receives the HTTP request; [`AuthService`](../backend/src/main/java/com/megumi/testops/auth/service/AuthService.java) owns the flow.

Registration does this inside a transaction:

```java
String email = normalizeEmail(request.email());
if (users.existsByEmail(email)) {
    throw new AuthException(HttpStatus.CONFLICT,
        "email_unavailable", "Unable to create an account with this email");
}
UserEntity user = new UserEntity(email, request.displayName().trim(),
        "ACTIVE", false, now);
users.save(user);
credentials.save(new LocalCredentialEntity(
        user, passwordEncoder.encode(request.password()), now));
issueAndSendChallenge(user, ip, now);
```

The password is encoded with BCrypt. The OTP itself is not stored. [`OtpHasher`](../backend/src/main/java/com/megumi/testops/auth/service/OtpHasher.java) computes an HMAC-SHA-256 value using a file-based pepper and the normalized email plus OTP. Verification compares digests in constant time.

The challenge has an expiry, resend cooldown, maximum failed attempts, delivery status, and source IP. This makes email verification auditable and rate-limitable.

### 7.3 JWT issuance and validation

[`JwtTokenService`](../backend/src/main/java/com/megumi/testops/auth/service/JwtTokenService.java) issues an RSA-signed access token with:

| Claim | Meaning |
| --- | --- |
| `iss` | Configured issuer. |
| `aud` | Configured API audience. |
| `sub` | Local TestOps user UUID. |
| `jti` | Unique token identifier. |
| `iat` / `exp` | Issue and expiry timestamps. |
| `roles` | Global platform roles, currently `ADMIN` or `MEMBER`. |
| `token_version` | User-side invalidation counter. |

[`AuthRuntimeConfiguration`](../backend/src/main/java/com/megumi/testops/auth/config/AuthRuntimeConfiguration.java) loads the private/public PEM files, builds an RSA JWK, creates the encoder, and configures the decoder with issuer and audience validators.

[`TestOpsJwtAuthenticationConverter`](../backend/src/main/java/com/megumi/testops/auth/config/TestOpsJwtAuthenticationConverter.java) rejects malformed subjects and roles, then converts `ADMIN` into Spring authority `ROLE_ADMIN` and `MEMBER` into `ROLE_MEMBER`.

### 7.4 Refresh-token rotation

The browser receives a random opaque refresh token in the cookie; PostgreSQL stores only its SHA-256 hash. [`RefreshTokenService`](../backend/src/main/java/com/megumi/testops/auth/service/RefreshTokenService.java) locks the current row, checks that it is not expired/used/revoked, marks it used, and creates a replacement in the same family.

```text
refresh cookie value
  → SHA-256
  → SELECT ... FOR UPDATE
  → usable?
     no  → revoke family + reject
     yes → mark used + insert replacement + issue JWT
```

The family ID lets the service revoke every token in the chain if a used token is replayed. The access token stays in frontend memory, while the refresh cookie is limited by name, path, SameSite, Secure, and expiry settings.

### 7.5 Google OpenID Connect

[`GoogleClientConfiguration`](../backend/src/main/java/com/megumi/testops/auth/config/GoogleClientConfiguration.java) creates the authorization-code client with `openid`, `profile`, and `email` scopes. [`OAuthLoginConfiguration`](../backend/src/main/java/com/megumi/testops/auth/config/OAuthLoginConfiguration.java) handles success and failure.

The success handler checks:

1. Google says the email is verified.
2. The provider subject and email exist.
3. The identity is either already linked or can create a new local user.
4. A pre-existing password account requires explicit link intent.
5. The backend issues the same local TestOps session as password login.

Google is therefore an identity provider, not the source of project authorization.

## 8. Project and definition implementation

### 8.1 Authorization is checked in the service

[`ProjectAccessService`](../backend/src/main/java/com/megumi/testops/project/service/ProjectAccessService.java) resolves:

- the local user from the JWT subject;
- the project by UUID;
- membership by project/user pair;
- global administrator access;
- required project roles.

The pattern in a mutation is:

```java
UserEntity actor = access.user(jwt);
ProjectEntity project = access.project(projectId);
access.requireProjectRole(project, actor, jwt,
        Set.of("PROJECT_MANAGER", "TEST_MANAGER"));
ensureActive(project);
```

The frontend may hide a button when a permission is absent, but this backend check is the real security boundary.

### 8.2 Project creation

[`ProjectService.create`](../backend/src/main/java/com/megumi/testops/project/service/ProjectService.java) requires a global administrator, validates the target origin, inserts the project, automatically inserts the creator as `PROJECT_MANAGER`, and records an audit event.

The target policy rejects credentials, query strings, fragments, paths, and unsafe literal/private addresses. A configured `TARGET_ALLOWED_ORIGINS` list can further restrict project origins.

### 8.3 Optimistic concurrency

JPA `@Version` fields appear on mutable entities such as `ProjectEntity`, `TestCaseEntity`, and `ProjectMemberEntity`. The API also accepts an optional `projectVersion` or resource version. A stale version returns `409 Conflict` rather than silently overwriting another user’s update.

This is the intended sequence:

```text
GET resource → version = 4
another user updates → version = 5
first user PUT version = 4
backend rejects stale_version
first user reloads and edits version = 5
```

### 8.4 Definition editing

[`DefinitionService`](../backend/src/main/java/com/megumi/testops/project/service/DefinitionService.java) handles suites, cases, and steps. It performs both DTO validation and aggregate validation:

- suite and case names are unique within their parent;
- case status is `DRAFT`, `READY`, or `ARCHIVED`;
- priority is `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`;
- retry count is between 0 and 5;
- a case contains at most 100 steps;
- positions are unique and contiguous starting at 0;
- actions and locator types are allowlisted;
- locator actions require a locator;
- navigation requires a URL input;
- assertions requiring expected text must provide it;
- a `READY` case cannot retain an ambiguous legacy `WAIT` step.

When a case is updated, the implementation deletes the existing step rows and saves the submitted ordered list. This keeps the aggregate simple and makes order explicit.

## 9. Variable handling

[`ProjectVariableService`](../backend/src/main/java/com/megumi/testops/project/service/ProjectVariableService.java) normalizes variable keys to uppercase snake case and caps a project at 100 variables.

Plain variables store `plaintext_value`. Secret variables are disabled by default. When enabled, [`ProjectVariableCrypto`](../backend/src/main/java/com/megumi/testops/project/service/ProjectVariableCrypto.java) loads a 32-byte AES key and uses AES-GCM with:

- a random 12-byte nonce;
- a 128-bit authentication tag;
- additional authenticated data containing project ID, variable key, and key version.

Secret values are write-only in API responses. The current execution path deliberately loads only non-secret variables into the Playwright interpolation map. This means secret interpolation is not yet an executable feature; it is safer than accidentally exposing secrets to traces or screenshots.

## 10. Execution implementation

### 10.1 Queueing

[`ExecutionService`](../backend/src/main/java/com/megumi/testops/execution/service/ExecutionService.java) checks project access and case readiness, requires a UUID `Idempotency-Key`, and returns an existing execution when the same project/key pair is repeated.

Queue capacity is controlled by the singleton `test_execution_queue_guard` row. The service locks that row, rejects a full queue, increments `active_count`, inserts the execution, and inserts one `QUEUED` case result per selected case.

The idempotency constraint is physical as well as logical:

```sql
CONSTRAINT uq_execution_idempotency UNIQUE(project_id, idempotency_key)
```

### 10.2 Claiming

[`ExecutionWorker`](../backend/src/main/java/com/megumi/testops/execution/service/ExecutionWorker.java) runs on a fixed delay from `application.yaml`. Each poll:

1. Skips work when the worker is disabled.
2. Recovers executions whose heartbeat is stale.
3. Claims the oldest queued row.
4. Marks it `RUNNING`.
5. Runs the execution.

[`ExecutionClaimService`](../backend/src/main/java/com/megumi/testops/execution/service/ExecutionClaimService.java) uses a pessimistic write lock on the queued row. With multiple worker instances, this prevents two transactions from claiming the same row after the repository query has selected it.

### 10.3 Running a case

[`ExecutionRunService`](../backend/src/main/java/com/megumi/testops/execution/service/ExecutionRunService.java) loops through case results. For each case it:

1. Checks cancellation.
2. Loads non-secret project variables.
3. Calculates `retryCount + 1` attempts.
4. Retries infrastructure errors only.
5. Converts the runner outcome to `PASSED`, `FAILED`, or `ERROR`.
6. Persists step results.
7. Persists case counters and timestamps.
8. Writes screenshot/trace artifacts when returned.
9. Updates execution counters.

At the end, the execution status is selected from the counters:

```text
cancelled cases > 0 → CANCELLED
else error cases > 0 → ERROR
else failed cases > 0 → FAILED
else → PASSED
```

### 10.4 Playwright lifecycle

[`PlaywrightCaseRunner`](../backend/src/main/java/com/megumi/testops/execution/runner/PlaywrightCaseRunner.java) lazily creates one Playwright process and Chromium browser, then creates a new `BrowserContext` and `Page` for each case.

The context is important: cookies, local storage, and browser state do not leak between cases. The context is closed by Java’s try-with-resources syntax:

```java
try (BrowserContext context = browser.newContext();
     Page page = context.newPage()) {
    // execute steps
}
```

The runner sets a default timeout, enforces a total execution deadline, optionally records tracing, executes each step in order, and catches failures into a safe message.

### 10.5 Artifact safety

[`ArtifactWriter`](../backend/src/main/java/com/megumi/testops/execution/runner/ArtifactWriter.java) stores files under:

```text
<artifact-root>/<execution-uuid>/<case-result-uuid>/<random-file>.<ext>
```

It normalizes the path and verifies it starts with the configured root. It writes bytes to disk and stores only searchable metadata plus a SHA-256 digest in `execution_artifacts`.

[`ExecutionTargetGuard`](../backend/src/main/java/com/megumi/testops/execution/runner/ExecutionTargetGuard.java) resolves relative URLs against the project origin, requires the same origin, and rejects localhost, private, loopback, link-local, site-local, multicast, and unresolved hosts.

## 11. Execution states and failure meaning

| State | Meaning |
| --- | --- |
| `QUEUED` | Persisted and waiting for a worker. |
| `RUNNING` | A worker claimed it and is executing. |
| `PASSED` | All selected cases passed. |
| `FAILED` | At least one browser assertion/action failed as a functional result. |
| `ERROR` | Infrastructure, target, browser, timeout, or worker failure prevented a trustworthy functional result. |
| `CANCELLED` | Cancellation was requested and observed. |

This classification matters for dashboards and release decisions: a target outage should not be counted as a product regression.

## 12. Repository queries and locking

Spring Data derives simple queries from method names:

```java
Optional<ProjectEntity> findByProjectIdAndId(UUID projectId, UUID id);
List<TestCaseEntity> findBySuiteIdAndStatusNotOrderByNameAsc(
        UUID suiteId, String status);
```

For concurrency-sensitive paths, annotations make the lock visible:

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select e from ExecutionEntity e where e.id = :id")
Optional<ExecutionEntity> lockById(UUID id);
```

Use pessimistic locking when correctness depends on exclusive ownership, such as refresh rotation, execution claiming, and queue capacity. Use `@Version` when the desired behavior is optimistic conflict detection for user edits.

## 13. Backend testing map

Tests are under [`backend/src/test`](../backend/src/test).

| Test | What it protects |
| --- | --- |
| `AuthPropertiesTest` | Startup/auth configuration invariants. |
| `AuthRateLimiterTest` | Bounded abuse controls. |
| `OriginGuardTest` | Same-origin refresh/logout rules. |
| `OtpHasherTest` | OTP hashing and matching. |
| `RefreshCookieFactoryTest` | Cookie attributes. |
| `ProjectTargetPolicyTest` | Target origin validation. |
| `ProjectVariableCryptoTest` | AES-GCM variable behavior. |
| `ExecutionTargetGuardTest` | Navigation safety. |
| `ApplicationContextIT` | Spring context and database integration. |
| `PlaywrightLaunchIT` | Deterministic Playwright launch. |
| `LiveTargetSmokeIT` | Optional target smoke path. |

The `*IT` naming matters because Maven Failsafe runs integration tests during `verify`, while unit tests run during `test`.

## 14. How to debug a backend request

Start at the route in the controller. Then ask:

1. Does `SecurityConfiguration` permit or authenticate the route?
2. Does the DTO reject the request before the service runs?
3. Which service rule could return the observed error code?
4. Which repository query loads the object?
5. Which entity method changes the state?
6. Which migration created the corresponding columns/constraints?
7. Is the method transactional, and does it need a lock?
8. Does a test cover the failure path?

Useful error codes to search for include `project_access_denied`, `project_role_required`, `stale_version`, `execution_queue_full`, `case_not_ready`, `unsafe_target_url`, and `refresh_invalid`.

