package com.megumi.testops.execution.service;

import java.time.Instant;
import java.util.List;
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
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.ExecutionQueueGuardRepository;
import com.megumi.testops.execution.repository.ExecutionVariableSnapshotRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.repository.TestStepResultRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.repository.TestCaseRepository;
import com.megumi.testops.project.repository.TestSuiteRepository;
import com.megumi.testops.project.repository.ProjectVariableRepository;
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

    public ExecutionService(ExecutionRepository executions, TestCaseResultRepository caseResults, TestStepResultRepository stepResults,
            ExecutionArtifactRepository artifacts, TestSuiteRepository suites, TestCaseRepository cases, ProjectAccessService access,
            PlatformProperties properties, ArtifactWriter artifactWriter, ExecutionQueueGuardRepository queueGuard,
            ExecutionVariableSnapshotRepository variableSnapshots, ProjectVariableRepository projectVariables) {
        this.executions = executions; this.caseResults = caseResults; this.stepResults = stepResults; this.artifacts = artifacts;
        this.suites = suites; this.cases = cases; this.access = access; this.properties = properties; this.artifactWriter = artifactWriter; this.queueGuard = queueGuard;
        this.variableSnapshots = variableSnapshots; this.projectVariables = projectVariables;
    }

    @Transactional
    public ExecutionEntity queueSuite(Jwt jwt, UUID projectId, UUID suiteId, UUID idempotencyKey) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId);
        access.requireProjectRole(project, user, jwt, Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER")); ensureActive(project);
        TestSuiteEntity suite = suites.findByIdAndProjectId(suiteId, projectId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "suite_not_found", "Suite was not found"));
        return queue(project, suite, user, readyCases(suiteId), idempotencyKey);
    }

    @Transactional
    public ExecutionEntity queueCase(Jwt jwt, UUID projectId, UUID suiteId, UUID caseId, UUID idempotencyKey) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId);
        access.requireProjectRole(project, user, jwt, Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER")); ensureActive(project);
        TestSuiteEntity suite = suites.findByIdAndProjectId(suiteId, projectId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "suite_not_found", "Suite was not found"));
        TestCaseEntity testCase = cases.findByIdAndSuiteId(caseId, suiteId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "case_not_found", "Case was not found"));
        if (!"READY".equals(testCase.getStatus())) throw error(HttpStatus.CONFLICT, "case_not_ready", "Only READY test cases can run");
        return queue(project, suite, user, List.of(testCase), idempotencyKey);
    }

    private ExecutionEntity queue(ProjectEntity project, TestSuiteEntity suite, UserEntity user, List<TestCaseEntity> selected, UUID key) {
        if (key == null) throw error(HttpStatus.BAD_REQUEST, "idempotency_key_required", "Idempotency-Key must be a UUID");
        var existing = executions.findByProjectIdAndIdempotencyKey(project.getId(), key);
        if (existing.isPresent()) return existing.get();
        if (selected.isEmpty()) throw error(HttpStatus.BAD_REQUEST, "no_ready_cases", "There are no READY test cases to run");
        var guard = queueGuard.lockGuard().orElseThrow(() -> new IllegalStateException("Execution queue guard row is missing")); if (guard.full(properties.execution().queueCapacity())) throw error(HttpStatus.TOO_MANY_REQUESTS, "execution_queue_full", "The execution queue is full"); guard.acquire(); queueGuard.save(guard);
        Instant now = Instant.now(); ExecutionEntity execution = executions.save(new ExecutionEntity(project, suite, user, selected.size(), key, now));
        caseResults.saveAll(selected.stream().map(testCase -> new TestCaseResultEntity(execution, testCase)).toList());
        variableSnapshots.saveAll(projectVariables.findByProjectIdOrderByKeyAsc(project.getId()).stream()
                .map(variable -> variable.isSecret() ? ExecutionVariableSnapshotEntity.secret(execution, variable)
                        : ExecutionVariableSnapshotEntity.plain(execution, variable))
                .toList());
        return execution;
    }

    @Transactional(readOnly = true)
    public List<ExecutionDtos.ExecutionSummaryResponse> list(Jwt jwt, UUID projectId) { UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); if (!access.globalAdmin(jwt)) access.membership(project, user); return executions.findByProjectIdOrderByCreatedAtDesc(projectId).stream().map(this::summary).toList(); }
    @Transactional(readOnly = true)
    public ExecutionDtos.ExecutionResponse get(Jwt jwt, UUID projectId, UUID executionId) { UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); if (!access.globalAdmin(jwt)) access.membership(project, user); return response(find(projectId, executionId)); }
    @Transactional(readOnly = true)
    public List<ExecutionDtos.CaseResultResponse> results(Jwt jwt, UUID projectId, UUID executionId) { get(jwt, projectId, executionId); return caseResults.findByExecutionIdOrderByTestCase_NameAsc(executionId).stream().map(this::caseResponse).toList(); }

    @Transactional
    public ExecutionEntity cancel(Jwt jwt, UUID projectId, UUID executionId) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); ExecutionEntity execution = find(projectId, executionId);
        boolean owner = execution.getRequestedBy().getId().equals(user.getId());
        boolean privileged = access.globalAdmin(jwt) || Set.of("PROJECT_MANAGER").contains(access.membership(project, user).getRole());
        if (!owner && !privileged) throw error(HttpStatus.FORBIDDEN, "cancel_denied", "Only the requester, project owner, or project admin can cancel an execution");
        if (ACTIVE.contains(execution.getStatus())) execution.requestCancel(Instant.now());
        return execution;
    }
    @Transactional(readOnly = true)
    public Path artifact(Jwt jwt, UUID projectId, UUID executionId, UUID artifactId) { return artifactDownload(jwt, projectId, executionId, artifactId).path(); }
    @Transactional(readOnly = true)
    public ArtifactDownload artifactDownload(Jwt jwt, UUID projectId, UUID executionId, UUID artifactId) { UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); if (!access.globalAdmin(jwt)) access.membership(project, user); find(projectId, executionId); var artifact = artifacts.findByExecutionIdAndId(executionId, artifactId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "artifact_not_found", "Artifact was not found")); if (artifact.getPurgedAt() != null) throw error(HttpStatus.GONE, "artifact_purged", "Artifact content has been purged"); return new ArtifactDownload(artifactWriter.resolve(artifact.getRelativePath()), artifact.getContentType(), artifact.getType()); }

    private ExecutionEntity find(UUID projectId, UUID id) { return executions.findByProjectIdAndId(projectId, id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "execution_not_found", "Execution was not found")); }
    private List<TestCaseEntity> readyCases(UUID suiteId) { return cases.findBySuiteIdAndStatusNotOrderByNameAsc(suiteId, "ARCHIVED").stream().filter(c -> "READY".equals(c.getStatus())).toList(); }
    private ExecutionDtos.ExecutionResponse response(ExecutionEntity e) { List<ExecutionDtos.CaseResultResponse> caseDtos = caseResults.findByExecutionIdOrderByTestCase_NameAsc(e.getId()).stream().map(this::caseResponse).toList(); List<ExecutionDtos.ArtifactResponse> artifactDtos = artifacts.findByExecutionIdOrderByCreatedAtAsc(e.getId()).stream().map(a -> new ExecutionDtos.ArtifactResponse(a.getId(), a.getCaseResultId(), a.getType(), a.getContentType(), a.getByteSize(), a.getSha256(), a.isSecretSuppressed(), a.getCreatedAt(), a.getPurgedAt(), a.getPurgeReason(), a.getStepPosition())).toList(); return new ExecutionDtos.ExecutionResponse(e.getId(), e.getProject().getId(), e.getSuite() == null ? null : e.getSuite().getId(), e.getStatus().name(), e.getTotalCases(), e.getCompletedCases(), e.getPassedCases(), e.getFailedCases(), e.getErrorCases(), e.getCancelledCases(), e.getCreatedAt(), e.getStartedAt(), e.getFinishedAt(), e.getErrorMessage(), e.getBrowser(), e.getTargetOriginSnapshot(), e.getSuiteNameSnapshot(), e.getInfrastructureErrorCategory(), caseDtos, artifactDtos); }
    private ExecutionDtos.ExecutionSummaryResponse summary(ExecutionEntity e) { return new ExecutionDtos.ExecutionSummaryResponse(e.getId(), e.getProject().getId(), e.getSuite() == null ? null : e.getSuite().getId(), e.getStatus().name(), e.getTotalCases(), e.getCompletedCases(), e.getPassedCases(), e.getFailedCases(), e.getErrorCases(), e.getCancelledCases(), e.getCreatedAt(), e.getStartedAt(), e.getFinishedAt(), e.getSuiteNameSnapshot(), e.getInfrastructureErrorCategory()); }
    private ExecutionDtos.CaseResultResponse caseResponse(TestCaseResultEntity result) { return new ExecutionDtos.CaseResultResponse(result.getId(), result.getTestCase().getId(), result.getCaseNameSnapshot(), result.getStatus().name(), result.getAttemptCount(), result.getStartedAt(), result.getFinishedAt(), result.getErrorMessage(), result.getFailedStepPosition(), result.getErrorCategory(), stepResults.findByCaseResultIdOrderByPositionAsc(result.getId()).stream().map(s -> new ExecutionDtos.StepResultResponse(s.getPosition(), s.getAction(), s.getStatus(), s.getDurationMs(), s.getErrorMessage())).toList()); }
    private static void ensureActive(ProjectEntity project) { if ("ARCHIVED".equals(project.getStatus())) throw error(HttpStatus.CONFLICT, "project_archived", "Archived projects are read-only"); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
    public record ArtifactDownload(Path path, String contentType, String type) { }
}
