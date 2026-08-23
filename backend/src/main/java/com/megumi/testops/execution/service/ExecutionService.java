package com.megumi.testops.execution.service;

import java.text.Normalizer;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.nio.file.Path;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.api.ExecutionDtos;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionStatus;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.domain.ExecutionVariableSnapshotEntity;
import com.megumi.testops.execution.domain.ExecutionStepSnapshotEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.ExecutionQueueGuardRepository;
import com.megumi.testops.execution.repository.ExecutionVariableSnapshotRepository;
import com.megumi.testops.execution.repository.ExecutionStepSnapshotRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.repository.TestStepResultRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.repository.TestCaseRepository;
import com.megumi.testops.project.repository.TestSuiteRepository;
import com.megumi.testops.project.repository.ProjectVariableRepository;
import com.megumi.testops.project.repository.TestStepRepository;
import com.megumi.testops.project.service.ProjectAccessService;
import com.megumi.testops.shared.api.ApiException;

@Service
public class ExecutionService {
    private static final Set<ExecutionStatus> ACTIVE = Set.of(ExecutionStatus.QUEUED, ExecutionStatus.RUNNING);
    private final ExecutionRepository executions;
    private final TestCaseResultRepository caseResults;
    private final TestStepResultRepository stepResults;
    private final ExecutionArtifactRepository artifacts;
    private final TestSuiteRepository suites;
    private final TestCaseRepository cases;
    private final ProjectAccessService access;
    private final PlatformProperties properties;
    private final ArtifactWriter artifactWriter;
    private final ExecutionQueueGuardRepository queueGuard;
    private final ExecutionVariableSnapshotRepository variableSnapshots;
    private final ProjectVariableRepository projectVariables;
    private final ExecutionStepSnapshotRepository stepSnapshots;
    private final TestStepRepository testSteps;

    public ExecutionService(ExecutionRepository executions, TestCaseResultRepository caseResults, TestStepResultRepository stepResults,
            ExecutionArtifactRepository artifacts, TestSuiteRepository suites, TestCaseRepository cases, ProjectAccessService access,
            PlatformProperties properties, ArtifactWriter artifactWriter, ExecutionQueueGuardRepository queueGuard,
            ExecutionVariableSnapshotRepository variableSnapshots, ProjectVariableRepository projectVariables,
            ExecutionStepSnapshotRepository stepSnapshots, TestStepRepository testSteps) {
        this.executions = executions; this.caseResults = caseResults; this.stepResults = stepResults; this.artifacts = artifacts;
        this.suites = suites; this.cases = cases; this.access = access; this.properties = properties; this.artifactWriter = artifactWriter; this.queueGuard = queueGuard;
        this.variableSnapshots = variableSnapshots; this.projectVariables = projectVariables; this.stepSnapshots = stepSnapshots; this.testSteps = testSteps;
    }

    @Transactional
    public ExecutionEntity queueSuite(Jwt jwt, UUID projectId, UUID suiteId, UUID idempotencyKey) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId);
        access.requireProjectRole(project, user, jwt, Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER")); ensureActive(project);
        TestSuiteEntity suite = suites.findByIdAndProjectId(suiteId, projectId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "suite_not_found", "Suite was not found"));
        ensureActive(suite);
        return queue(project, suite, user, readyCases(suiteId), idempotencyKey);
    }

    @Transactional
    public ExecutionDtos.ExecutionQueuedResponse queueSuiteResponse(
            Jwt jwt, UUID projectId, UUID suiteId, UUID idempotencyKey) {
        ExecutionEntity execution = queueSuite(jwt, projectId, suiteId, idempotencyKey);
        return new ExecutionDtos.ExecutionQueuedResponse(execution.getId(), execution.getStatus().name(),
                canCancel(jwt, projectId, execution));
    }

    @Transactional
    public ExecutionEntity queueCase(Jwt jwt, UUID projectId, UUID suiteId, UUID caseId, UUID idempotencyKey) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId);
        access.requireProjectRole(project, user, jwt, Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER")); ensureActive(project);
        TestSuiteEntity suite = suites.findByIdAndProjectId(suiteId, projectId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "suite_not_found", "Suite was not found"));
        ensureActive(suite);
        TestCaseEntity testCase = cases.findByIdAndSuiteId(caseId, suiteId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "case_not_found", "Case was not found"));
        if (!"READY".equals(testCase.getStatus())) throw error(HttpStatus.CONFLICT, "case_not_ready", "Only READY test cases can run");
        return queue(project, suite, user, List.of(testCase), idempotencyKey);
    }

    @Transactional
    public ExecutionDtos.ExecutionQueuedResponse queueCaseResponse(
            Jwt jwt, UUID projectId, UUID suiteId, UUID caseId, UUID idempotencyKey) {
        ExecutionEntity execution = queueCase(jwt, projectId, suiteId, caseId, idempotencyKey);
        return new ExecutionDtos.ExecutionQueuedResponse(execution.getId(), execution.getStatus().name(),
                canCancel(jwt, projectId, execution));
    }

    private ExecutionEntity queue(ProjectEntity project, TestSuiteEntity suite, UserEntity user, List<TestCaseEntity> selected, UUID key) {
        if (!properties.execution().workerEnabled()) {
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "execution_worker_disabled",
                    "Execution is temporarily unavailable because the worker is disabled");
        }
        if (key == null) throw error(HttpStatus.BAD_REQUEST, "idempotency_key_required", "Idempotency-Key must be a UUID");
        var existing = executions.findByProjectIdAndIdempotencyKey(project.getId(), key);
        if (existing.isPresent()) return existing.get();
        if (selected.isEmpty()) throw error(HttpStatus.BAD_REQUEST, "no_ready_cases", "There are no READY test cases to run");
        var guard = queueGuard.lockGuard().orElseThrow(() -> new IllegalStateException("Execution queue guard row is missing")); if (guard.full(properties.execution().queueCapacity())) throw error(HttpStatus.TOO_MANY_REQUESTS, "execution_queue_full", "The execution queue is full"); guard.acquire(); queueGuard.save(guard);
        Instant now = Instant.now(); ExecutionEntity execution = executions.save(new ExecutionEntity(project, suite, user, selected.size(), key, now));
        var caseResultEntities = selected.stream().map(testCase -> new TestCaseResultEntity(execution, testCase)).toList();
        caseResults.saveAll(caseResultEntities);
        stepSnapshots.saveAll(caseResultEntities.stream()
                .flatMap(caseResult -> testSteps.findByTestCaseIdOrderByPositionAsc(caseResult.getTestCase().getId()).stream()
                        .map(step -> ExecutionStepSnapshotEntity.from(caseResult, step)))
                .toList());
        variableSnapshots.saveAll(projectVariables.findByProjectIdOrderByKeyAsc(project.getId()).stream()
                .map(variable -> variable.isSecret() ? ExecutionVariableSnapshotEntity.secret(execution, variable)
                        : ExecutionVariableSnapshotEntity.plain(execution, variable))
                .toList());
        return execution;
    }

    @Transactional(readOnly = true)
    public List<ExecutionDtos.ExecutionSummaryResponse> list(Jwt jwt, UUID projectId) {
        Caller caller = authorizeView(jwt, access.project(projectId));
        return executions.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(execution -> summary(execution, caller))
                .toList();
    }

    @Transactional(readOnly = true)
    public ExecutionDtos.ExecutionResponse get(Jwt jwt, UUID projectId, UUID executionId) {
        Caller caller = authorizeView(jwt, access.project(projectId));
        return response(find(projectId, executionId), caller);
    }

    @Transactional(readOnly = true)
    public List<ExecutionDtos.CaseResultResponse> results(Jwt jwt, UUID projectId, UUID executionId) {
        authorizeView(jwt, access.project(projectId));
        find(projectId, executionId);
        return caseResults.findByExecutionIdOrderByTestCase_NameAsc(executionId).stream()
                .map(this::caseResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public boolean canCancel(Jwt jwt, UUID projectId, ExecutionEntity execution) {
        Caller caller = authorizeView(jwt, access.project(projectId));
        if (!projectId.equals(execution.getProject().getId())) {
            throw error(HttpStatus.NOT_FOUND, "execution_not_found", "Execution was not found");
        }
        return canCancel(execution, caller);
    }

    @Transactional
    public ExecutionEntity cancel(Jwt jwt, UUID projectId, UUID executionId) {
        UserEntity user = access.user(jwt);
        ProjectEntity project = access.project(projectId);
        boolean globalAdmin = access.globalAdmin(jwt);
        // Ordinary users must still be current project members before the
        // execution identifier is resolved. This keeps removed requesters and
        // non-members from using cancellation as an existence oracle.
        ProjectMemberEntity membership = globalAdmin ? null : access.membership(project, user);
        ExecutionEntity execution = executions.lockByProjectIdAndId(projectId, executionId)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "execution_not_found", "Execution was not found"));
        Caller caller = new Caller(user, membership, globalAdmin);
        if (!hasCancellationPermission(execution, caller)) {
            throw error(HttpStatus.FORBIDDEN, "cancel_denied",
                    "Your current project permissions do not allow cancellation of this execution");
        }
        if (ACTIVE.contains(execution.getStatus()) && !execution.cancelRequested()) {
            execution.requestCancel(Instant.now());
        }
        return execution;
    }

    @Transactional(readOnly = true)
    public Path artifact(Jwt jwt, UUID projectId, UUID executionId, UUID artifactId) { return artifactDownload(jwt, projectId, executionId, artifactId).path(); }

    @Transactional(readOnly = true)
    public ArtifactDownload artifactDownload(Jwt jwt, UUID projectId, UUID executionId, UUID artifactId) {
        authorizeView(jwt, access.project(projectId));
        ExecutionEntity execution = find(projectId, executionId);
        var artifact = artifacts.findByExecutionIdAndId(executionId, artifactId)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "artifact_not_found", "Artifact was not found"));
        if (artifact.isSecretSuppressed()
                || (artifact.getCaseResult() != null && artifact.getCaseResult().isEvidenceSuppressed())) {
            throw error(HttpStatus.GONE, "artifact_suppressed", "Artifact content was suppressed by evidence policy");
        }
        if (artifact.getPurgedAt() != null) {
            throw error(HttpStatus.GONE, "artifact_purged", "Artifact content has been purged");
        }
        return new ArtifactDownload(artifactWriter.resolve(artifact.getRelativePath()), artifact.getContentType(),
                artifact.getType(), downloadFilename(execution, artifact));
    }

    private ExecutionEntity find(UUID projectId, UUID id) { return executions.findByProjectIdAndId(projectId, id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "execution_not_found", "Execution was not found")); }
    private List<TestCaseEntity> readyCases(UUID suiteId) { return cases.findBySuiteIdAndStatusNotOrderByNameAsc(suiteId, "ARCHIVED").stream().filter(c -> "READY".equals(c.getStatus())).toList(); }
    private ExecutionDtos.ExecutionResponse response(ExecutionEntity execution, Caller caller) {
        List<TestCaseResultEntity> resultEntities = caseResults
                .findByExecutionIdOrderByTestCase_NameAsc(execution.getId());
        List<ExecutionDtos.CaseResultResponse> caseDtos = resultEntities.stream().map(this::caseResponse).toList();
        Map<UUID, TestCaseResultEntity> resultsById = resultEntities.stream()
                .collect(java.util.stream.Collectors.toMap(TestCaseResultEntity::getId, result -> result));
        List<ExecutionDtos.ArtifactResponse> artifactDtos = artifacts
                .findByExecutionIdOrderByCreatedAtAsc(execution.getId()).stream()
                .map(artifact -> {
                    TestCaseResultEntity caseResult = resultsById.get(artifact.getCaseResultId());
                    boolean suppressed = artifact.isSecretSuppressed()
                            || (caseResult != null && caseResult.isEvidenceSuppressed());
                    return new ExecutionDtos.ArtifactResponse(artifact.getId(), artifact.getCaseResultId(),
                            artifact.getType(), artifact.getContentType(), artifact.getByteSize(), artifact.getSha256(),
                            suppressed, artifact.getCreatedAt(), artifact.getPurgedAt(), artifact.getPurgeReason(),
                            artifact.getStepPosition(), downloadFilename(execution, artifact));
                })
                .toList();
        return new ExecutionDtos.ExecutionResponse(execution.getId(), execution.getProject().getId(),
                execution.getSuite() == null ? null : execution.getSuite().getId(), execution.getStatus().name(),
                canCancel(execution, caller), execution.getTotalCases(), execution.getCompletedCases(),
                execution.getPassedCases(), execution.getFailedCases(), execution.getErrorCases(),
                execution.getCancelledCases(), execution.getCreatedAt(), execution.getStartedAt(),
                execution.getFinishedAt(), execution.getErrorMessage(), execution.getBrowser(),
                execution.getTargetOriginSnapshot(), execution.getSuiteNameSnapshot(),
                execution.getInfrastructureErrorCategory(), caseDtos, artifactDtos);
    }

    private ExecutionDtos.ExecutionSummaryResponse summary(ExecutionEntity execution, Caller caller) {
        return new ExecutionDtos.ExecutionSummaryResponse(execution.getId(), execution.getProject().getId(),
                execution.getSuite() == null ? null : execution.getSuite().getId(), execution.getStatus().name(),
                canCancel(execution, caller), execution.getTotalCases(), execution.getCompletedCases(),
                execution.getPassedCases(), execution.getFailedCases(), execution.getErrorCases(),
                execution.getCancelledCases(), execution.getCreatedAt(), execution.getStartedAt(),
                execution.getFinishedAt(), execution.getSuiteNameSnapshot(), execution.getInfrastructureErrorCategory());
    }

    private ExecutionDtos.CaseResultResponse caseResponse(TestCaseResultEntity result) {
        return new ExecutionDtos.CaseResultResponse(result.getId(), result.getTestCase().getId(),
                result.getCaseNameSnapshot(), result.getStatus().name(), result.getAttemptCount(), result.getStartedAt(),
                result.getFinishedAt(), result.getErrorMessage(), result.getFailedStepPosition(),
                result.getErrorCategory(), result.isEvidenceSuppressed(), result.getEvidenceSuppressionReason(),
                stepResults.findByCaseResultIdOrderByPositionAsc(result.getId()).stream()
                        .map(step -> new ExecutionDtos.StepResultResponse(step.getPosition(), step.getAction(),
                                step.getStatus(), step.getDurationMs(), step.getErrorMessage()))
                        .toList());
    }

    private Caller authorizeView(Jwt jwt, ProjectEntity project) {
        UserEntity user = access.user(jwt);
        boolean globalAdmin = access.globalAdmin(jwt);
        ProjectMemberEntity membership = globalAdmin ? null : access.membership(project, user);
        return new Caller(user, membership, globalAdmin);
    }

    private static boolean canCancel(ExecutionEntity execution, Caller caller) {
        return ACTIVE.contains(execution.getStatus())
                && !execution.cancelRequested()
                && hasCancellationPermission(execution, caller);
    }

    private static boolean hasCancellationPermission(ExecutionEntity execution, Caller caller) {
        if (caller.globalAdmin()) return true;
        if (caller.membership() == null) return false;
        String role = caller.membership().getRole();
        if ("PROJECT_MANAGER".equals(role)) return true;
        boolean ownsExecution = execution.getRequestedBy().getId().equals(caller.user().getId());
        return ownsExecution && Set.of("TEST_MANAGER", "TESTER").contains(role);
    }

    private static String downloadFilename(ExecutionEntity execution,
            com.megumi.testops.execution.domain.ExecutionArtifactEntity artifact) {
        String suite = execution.getSuiteNameSnapshot();
        String testCase = artifact.getCaseResult() == null ? null : artifact.getCaseResult().getCaseNameSnapshot();
        String context = String.join("-", java.util.stream.Stream.of(suite, testCase)
                .filter(value -> value != null && !value.isBlank()).toList());
        String stem = safeFilenamePart(context);
        String shortExecutionId = execution.getId().toString().substring(0, 8);
        String step = artifact.getStepPosition() == null ? "" : "-step-" + artifact.getStepPosition();
        String type = "SCREENSHOT".equals(artifact.getType()) ? "screenshot" : "trace";
        String extension = "SCREENSHOT".equals(artifact.getType()) ? ".png" : ".zip";
        return stem + "-" + shortExecutionId + step + "-" + type + extension;
    }

    private static String safeFilenamePart(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+|-+$)", "");
        if (normalized.isBlank()) normalized = "execution";
        return normalized.length() > 80 ? normalized.substring(0, 80).replaceAll("-+$", "") : normalized;
    }

    private static void ensureActive(ProjectEntity project) { if ("ARCHIVED".equals(project.getStatus())) throw error(HttpStatus.CONFLICT, "project_archived", "Archived projects are read-only"); }
    private static void ensureActive(TestSuiteEntity suite) { if ("ARCHIVED".equals(suite.getStatus())) throw error(HttpStatus.CONFLICT, "suite_archived", "Archived suites cannot be executed"); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
    private record Caller(UserEntity user, ProjectMemberEntity membership, boolean globalAdmin) { }
    public record ArtifactDownload(Path path, String contentType, String type, String downloadFilename) { }
}
