package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.domain.ExecutionArtifactEntity;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionQueueGuardEntity;
import com.megumi.testops.execution.domain.ExecutionStepSnapshotEntity;
import com.megumi.testops.execution.domain.ExecutionVariableSnapshotEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;
import com.megumi.testops.execution.repository.ExecutionQueueGuardRepository;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.ExecutionVariableSnapshotRepository;
import com.megumi.testops.execution.repository.ExecutionStepSnapshotRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.repository.TestStepResultRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;
import com.megumi.testops.execution.service.ExecutionService;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.domain.TestStepEntity;
import com.megumi.testops.project.repository.TestCaseRepository;
import com.megumi.testops.project.repository.ProjectVariableRepository;
import com.megumi.testops.project.repository.TestStepRepository;
import com.megumi.testops.project.repository.TestSuiteRepository;
import com.megumi.testops.project.service.ProjectAccessService;
import com.megumi.testops.shared.api.ApiException;

class ExecutionServiceTest {
    private final ExecutionRepository executions = mock(ExecutionRepository.class);
    private final TestCaseResultRepository caseResults = mock(TestCaseResultRepository.class);
    private final TestStepResultRepository stepResults = mock(TestStepResultRepository.class);
    private final ExecutionArtifactRepository artifacts = mock(ExecutionArtifactRepository.class);
    private final TestSuiteRepository suites = mock(TestSuiteRepository.class);
    private final TestCaseRepository cases = mock(TestCaseRepository.class);
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ArtifactWriter artifactWriter = mock(ArtifactWriter.class);
    private final ExecutionQueueGuardRepository queueGuard = mock(ExecutionQueueGuardRepository.class);
    private final ExecutionVariableSnapshotRepository variableSnapshots = mock(ExecutionVariableSnapshotRepository.class);
    private final ProjectVariableRepository projectVariables = mock(ProjectVariableRepository.class);
    private final ExecutionStepSnapshotRepository stepSnapshots = mock(ExecutionStepSnapshotRepository.class);
    private final TestStepRepository testSteps = mock(TestStepRepository.class);
    private final PlatformProperties properties = new PlatformProperties(
            new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(5), Duration.ofMinutes(1),
                    Duration.ofMinutes(5), Duration.ofSeconds(10), "chromium", true),
            new PlatformProperties.Artifact(Path.of("artifacts"), 0),
            new PlatformProperties.Target(List.of("https://target.example.test"), false, "host.docker.internal"));
    private ExecutionService service;
    private UserEntity user;
    private ProjectEntity project;
    private TestSuiteEntity suite;
    private Jwt jwt;

    @BeforeEach
    void setUp() {
        Instant now = Instant.now();
        user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        project = new ProjectEntity("Execution project", null, "https://target.example.test", user, now);
        suite = new TestSuiteEntity(project, "Smoke suite", null, user, now);
        jwt = Jwt.withTokenValue("test-token").header("alg", "none").subject(user.getId().toString()).build();
        service = new ExecutionService(executions, caseResults, stepResults, artifacts, suites, cases, access,
                properties, artifactWriter, queueGuard, variableSnapshots, projectVariables, stepSnapshots, testSteps);
        when(access.user(jwt)).thenReturn(user);
        when(access.project(project.getId())).thenReturn(project);
        doNothing().when(access).requireProjectRole(eq(project), eq(user), eq(jwt), any());
        when(suites.findByIdAndProjectId(suite.getId(), project.getId())).thenReturn(Optional.of(suite));
    }

    @Test
    void rejectsMissingIdempotencyKeyBeforeWritingExecution() {
        ApiException error = assertThrows(ApiException.class,
                () -> service.queueSuite(jwt, project.getId(), suite.getId(), null));

        assertEquals("idempotency_key_required", error.getCode());
        verify(executions, never()).save(any());
        verify(queueGuard, never()).lockGuard();
    }

    @Test
    void replaysExistingExecutionForSameIdempotencyKey() {
        UUID key = UUID.randomUUID();
        ExecutionEntity existing = new ExecutionEntity(project, suite, user, 1, key, Instant.now());
        when(executions.findByProjectIdAndIdempotencyKey(project.getId(), key)).thenReturn(Optional.of(existing));

        ExecutionEntity replay = service.queueSuite(jwt, project.getId(), suite.getId(), key);

        assertSame(existing, replay);
        verify(queueGuard, never()).lockGuard();
        verify(caseResults, never()).saveAll(any());
        verify(variableSnapshots, never()).saveAll(any());
        verify(stepSnapshots, never()).saveAll(any());
    }

    @Test
    void rejectsSuiteWithoutReadyCases() {
        UUID key = UUID.randomUUID();
        when(executions.findByProjectIdAndIdempotencyKey(project.getId(), key)).thenReturn(Optional.empty());
        when(cases.findBySuiteIdAndStatusNotOrderByNameAsc(suite.getId(), "ARCHIVED")).thenReturn(List.of());

        ApiException error = assertThrows(ApiException.class,
                () -> service.queueSuite(jwt, project.getId(), suite.getId(), key));

        assertEquals("no_ready_cases", error.getCode());
        verify(queueGuard, never()).lockGuard();
        verify(executions, never()).save(any());
    }

    @Test
    void snapshotsPlainAndEncryptedVariablesWhenQueueing() {
        UUID key = UUID.randomUUID();
        TestCaseEntity testCase = new TestCaseEntity(suite, "Ready case", null, "READY", "HIGH", null, 0, false, user, Instant.now());
        TestStepEntity step = new TestStepEntity(testCase, 1, "NAVIGATE", null, null, null,
                "/search?q=${SEARCH_TERM}", null, 5000, Instant.now());
        when(executions.findByProjectIdAndIdempotencyKey(project.getId(), key)).thenReturn(Optional.empty());
        when(cases.findBySuiteIdAndStatusNotOrderByNameAsc(suite.getId(), "ARCHIVED")).thenReturn(List.of(testCase));
        ExecutionQueueGuardEntity guard = mock(ExecutionQueueGuardEntity.class);
        when(guard.full(10)).thenReturn(false);
        when(queueGuard.lockGuard()).thenReturn(Optional.of(guard));
        when(executions.save(any(ExecutionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(projectVariables.findByProjectIdOrderByKeyAsc(project.getId())).thenReturn(List.of(
                com.megumi.testops.project.domain.ProjectVariableEntity.plain(project, "SEARCH_TERM", "dress", Instant.now()),
                com.megumi.testops.project.domain.ProjectVariableEntity.encrypted(project, "PASSWORD", new byte[] { 1 }, new byte[] { 2 }, 1, Instant.now())));
        when(testSteps.findByTestCaseIdOrderByPositionAsc(testCase.getId())).thenReturn(List.of(step));

        service.queueSuite(jwt, project.getId(), suite.getId(), key);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<ExecutionVariableSnapshotEntity>> captured = ArgumentCaptor.forClass(Iterable.class);
        verify(variableSnapshots).saveAll(captured.capture());
        List<ExecutionVariableSnapshotEntity> snapshots = java.util.stream.StreamSupport.stream(captured.getValue().spliterator(), false).toList();
        assertEquals(2, snapshots.size());
        var byKey = snapshots.stream().collect(java.util.stream.Collectors.toMap(ExecutionVariableSnapshotEntity::getKey, snapshot -> snapshot));
        assertEquals(true, byKey.get("PASSWORD").isSecret());
        assertEquals(null, byKey.get("PASSWORD").getValue());
        assertEquals("dress", byKey.get("SEARCH_TERM").getValue());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<ExecutionStepSnapshotEntity>> stepCaptor = ArgumentCaptor.forClass(Iterable.class);
        verify(stepSnapshots).saveAll(stepCaptor.capture());
        ExecutionStepSnapshotEntity stepSnapshot = java.util.stream.StreamSupport.stream(stepCaptor.getValue().spliterator(), false).findFirst().orElseThrow();
        assertEquals(1, stepSnapshot.getPosition());
        assertEquals("NAVIGATE", stepSnapshot.getAction());
        assertEquals("/search?q=${SEARCH_TERM}", stepSnapshot.getInputValue());
    }

    @Test
    void rejectsQueueWhenTheGuardIsAtCapacityBeforeWritingSnapshots() {
        UUID key = UUID.randomUUID();
        TestCaseEntity testCase = new TestCaseEntity(suite, "Ready case", null, "READY", "HIGH", null, 0, false, user, Instant.now());
        when(executions.findByProjectIdAndIdempotencyKey(project.getId(), key)).thenReturn(Optional.empty());
        when(cases.findBySuiteIdAndStatusNotOrderByNameAsc(suite.getId(), "ARCHIVED")).thenReturn(List.of(testCase));
        ExecutionQueueGuardEntity guard = mock(ExecutionQueueGuardEntity.class);
        when(guard.full(10)).thenReturn(true);
        when(queueGuard.lockGuard()).thenReturn(Optional.of(guard));

        ApiException error = assertThrows(ApiException.class,
                () -> service.queueSuite(jwt, project.getId(), suite.getId(), key));

        assertEquals("execution_queue_full", error.getCode());
        assertEquals(429, error.getStatus().value());
        verify(guard, never()).acquire();
        verify(queueGuard, never()).save(any());
        verify(executions, never()).save(any());
        verify(caseResults, never()).saveAll(any());
        verify(stepSnapshots, never()).saveAll(any());
        verify(variableSnapshots, never()).saveAll(any());
    }

    @Test
    void rejectsQueueingACaseFromAnotherSuiteBeforeTakingTheQueueGuard() {
        UUID caseId = UUID.randomUUID();
        UUID key = UUID.randomUUID();
        when(cases.findByIdAndSuiteId(caseId, suite.getId())).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.queueCase(jwt, project.getId(), suite.getId(), caseId, key));

        assertEquals("case_not_found", error.getCode());
        assertEquals(404, error.getStatus().value());
        verify(queueGuard, never()).lockGuard();
        verify(executions, never()).save(any());
    }

    @Test
    void downloadsArtifactForProjectMemberAndRejectsPurgedContent() {
        UUID key = UUID.randomUUID();
        ExecutionEntity execution = new ExecutionEntity(project, suite, user, 1, key, Instant.now());
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity(execution, null, 2, "SCREENSHOT",
                "execution/case/shot.png", "image/png", 3, "sha256", false, Instant.now());
        when(access.globalAdmin(jwt)).thenReturn(false);
        when(access.membership(eq(project), eq(user))).thenReturn(mock(ProjectMemberEntity.class));
        when(executions.findByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));
        when(artifacts.findByExecutionIdAndId(execution.getId(), artifact.getId())).thenReturn(Optional.of(artifact));
        when(artifactWriter.resolve(artifact.getRelativePath())).thenReturn(Path.of("artifacts", "execution", "case", "shot.png"));

        ExecutionService.ArtifactDownload download = service.artifactDownload(jwt, project.getId(), execution.getId(), artifact.getId());

        assertEquals(Path.of("artifacts", "execution", "case", "shot.png"), download.path());
        assertEquals("image/png", download.contentType());
        assertEquals("SCREENSHOT", download.type());
        assertEquals("smoke-suite-" + execution.getId().toString().substring(0, 8)
                + "-step-2-screenshot.png", download.downloadFilename());

        artifact.markPurged(Instant.now(), "RETENTION");
        ApiException error = assertThrows(ApiException.class,
                () -> service.artifactDownload(jwt, project.getId(), execution.getId(), artifact.getId()));
        assertEquals("artifact_purged", error.getCode());
    }

    @Test
    void rejectsArtifactDownloadForNonMemberBeforeReadingArtifact() {
        UUID executionId = UUID.randomUUID();
        UUID artifactId = UUID.randomUUID();
        ApiException denied = new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,
                "project_access_denied", "You do not have access to this project");
        when(access.globalAdmin(jwt)).thenReturn(false);
        when(access.membership(eq(project), eq(user))).thenThrow(denied);

        ApiException error = assertThrows(ApiException.class,
                () -> service.artifactDownload(jwt, project.getId(), executionId, artifactId));

        assertSame(denied, error);
        verify(executions, never()).findByProjectIdAndId(any(), any());
        verify(artifacts, never()).findByExecutionIdAndId(any(), any());
        verify(artifactWriter, never()).resolve(any());
    }

    @Test
    void rejectsQueueingAnArchivedSuite() {
        suite.archive(Instant.now());

        ApiException error = assertThrows(ApiException.class,
                () -> service.queueSuite(jwt, project.getId(), suite.getId(), UUID.randomUUID()));

        assertEquals("suite_archived", error.getCode());
        verify(executions, never()).save(any());
    }

    @Test
    void onlyRequesterOrProjectManagerCanCancel() {
        UserEntity requester = user;
        UserEntity tester = mock(UserEntity.class);
        when(tester.getId()).thenReturn(UUID.randomUUID());
        ExecutionEntity execution = new ExecutionEntity(project, suite, requester, 1, UUID.randomUUID(), Instant.now());
        when(access.user(jwt)).thenReturn(tester);
        when(executions.lockByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));
        ProjectMemberEntity membership = mock(ProjectMemberEntity.class);
        when(membership.getRole()).thenReturn("TESTER");
        when(access.membership(project, tester)).thenReturn(membership);

        ApiException denied = assertThrows(ApiException.class,
                () -> service.cancel(jwt, project.getId(), execution.getId()));
        assertEquals("cancel_denied", denied.getCode());

        when(membership.getRole()).thenReturn("PROJECT_MANAGER");
        assertSame(execution, service.cancel(jwt, project.getId(), execution.getId()));
    }

    @Test
    void requesterCanCancelWithoutAProjectManagerRole() {
        ExecutionEntity execution = new ExecutionEntity(project, suite, user, 1, UUID.randomUUID(), Instant.now());
        ProjectMemberEntity membership = mock(ProjectMemberEntity.class);
        when(membership.getRole()).thenReturn("TESTER");
        when(access.membership(project, user)).thenReturn(membership);
        when(executions.lockByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));

        assertSame(execution, service.cancel(jwt, project.getId(), execution.getId()));
        assertTrue(execution.cancelRequested());
        verify(access).membership(project, user);
    }

    @Test
    void crossProjectExecutionIdentifierIsHiddenAfterCurrentMembershipIsVerified() {
        UUID foreignExecutionId = UUID.randomUUID();
        ProjectMemberEntity membership = mock(ProjectMemberEntity.class);
        when(membership.getRole()).thenReturn("TESTER");
        when(access.membership(project, user)).thenReturn(membership);
        when(executions.lockByProjectIdAndId(project.getId(), foreignExecutionId)).thenReturn(Optional.empty());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.cancel(jwt, project.getId(), foreignExecutionId));

        assertEquals("execution_not_found", failure.getCode());
        assertEquals(404, failure.getStatus().value());
        verify(access).membership(project, user);
    }

    @Test
    void returnsDistinctServiceUnavailableWhenWorkerIsDisabled() {
        PlatformProperties disabled = new PlatformProperties(
                new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(5),
                        Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofSeconds(10), "chromium", false),
                new PlatformProperties.Artifact(Path.of("artifacts"), 0),
                new PlatformProperties.Target(List.of("https://target.example.test"), false,
                        "host.docker.internal"));
        ExecutionService disabledService = serviceWith(disabled);

        ApiException failure = assertThrows(ApiException.class,
                () -> disabledService.queueSuite(jwt, project.getId(), suite.getId(), UUID.randomUUID()));

        assertEquals(503, failure.getStatus().value());
        assertEquals("execution_worker_disabled", failure.getCode());
        verify(executions, never()).findByProjectIdAndIdempotencyKey(any(), any());
        verify(queueGuard, never()).lockGuard();
    }

    @Test
    void removedRequesterIsDeniedBeforeExecutionLookup() {
        UUID executionId = UUID.randomUUID();
        ApiException denied = new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,
                "project_access_denied", "You do not have access to this project");
        when(access.membership(project, user)).thenThrow(denied);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.cancel(jwt, project.getId(), executionId));

        assertSame(denied, failure);
        verify(executions, never()).lockByProjectIdAndId(any(), any());
    }

    @Test
    void globalAdminCanCancelAnyActiveExecutionWithoutProjectMembership() {
        UserEntity requester = mock(UserEntity.class);
        when(requester.getId()).thenReturn(UUID.randomUUID());
        ExecutionEntity execution = new ExecutionEntity(project, suite, requester, 1, UUID.randomUUID(), Instant.now());
        when(access.globalAdmin(jwt)).thenReturn(true);
        when(executions.lockByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));

        assertTrue(service.canCancel(jwt, project.getId(), execution));
        assertSame(execution, service.cancel(jwt, project.getId(), execution.getId()));
        assertTrue(execution.cancelRequested());
        verify(access, never()).membership(project, user);
    }

    @Test
    void repeatedCancellationIsIdempotentAndRemovesCanCancel() {
        ProjectMemberEntity membership = mock(ProjectMemberEntity.class);
        when(membership.getRole()).thenReturn("TESTER");
        when(access.membership(project, user)).thenReturn(membership);
        ExecutionEntity execution = new ExecutionEntity(project, suite, user, 1, UUID.randomUUID(), Instant.now());
        when(executions.lockByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));

        service.cancel(jwt, project.getId(), execution.getId());
        Instant firstRequest = execution.getCancelRequestedAt();
        service.cancel(jwt, project.getId(), execution.getId());

        assertSame(firstRequest, execution.getCancelRequestedAt());
        assertFalse(service.canCancel(jwt, project.getId(), execution));
    }

    @Test
    void listComputesCancellationPerExecutionForCurrentRoleAndRequester() {
        ProjectMemberEntity membership = mock(ProjectMemberEntity.class);
        when(membership.getRole()).thenReturn("TESTER");
        when(access.membership(project, user)).thenReturn(membership);
        UserEntity otherRequester = mock(UserEntity.class);
        when(otherRequester.getId()).thenReturn(UUID.randomUUID());
        ExecutionEntity own = new ExecutionEntity(project, suite, user, 1, UUID.randomUUID(), Instant.now());
        ExecutionEntity other = new ExecutionEntity(project, suite, otherRequester, 1, UUID.randomUUID(), Instant.now());
        when(executions.findByProjectIdOrderByCreatedAtDesc(project.getId())).thenReturn(List.of(own, other));

        var summaries = service.list(jwt, project.getId());

        assertTrue(summaries.get(0).canCancel());
        assertFalse(summaries.get(1).canCancel());
    }

    @Test
    void responseExposesDurableSuppressionReasonAndSafeArtifactFilename() {
        ProjectMemberEntity membership = mock(ProjectMemberEntity.class);
        when(membership.getRole()).thenReturn("TESTER");
        when(access.membership(project, user)).thenReturn(membership);
        TestCaseEntity testCase = new TestCaseEntity(suite, "Checkout / đăng nhập", null, "READY", "HIGH",
                null, 0, false, user, Instant.now());
        ExecutionEntity execution = new ExecutionEntity(project, suite, user, 1, UUID.randomUUID(), Instant.now());
        com.megumi.testops.execution.domain.TestCaseResultEntity result =
                new com.megumi.testops.execution.domain.TestCaseResultEntity(execution, testCase);
        result.suppressEvidence("SECRET_VARIABLE_USED");
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity(execution, result, 3, "SCREENSHOT",
                "execution/case/shot.png", "image/png", 3, "sha256", false, Instant.now());
        when(executions.findByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));
        when(caseResults.findByExecutionIdOrderByTestCase_NameAsc(execution.getId())).thenReturn(List.of(result));
        when(stepResults.findByCaseResultIdOrderByPositionAsc(result.getId())).thenReturn(List.of());
        when(artifacts.findByExecutionIdOrderByCreatedAtAsc(execution.getId())).thenReturn(List.of(artifact));

        var response = service.get(jwt, project.getId(), execution.getId());

        assertTrue(response.canCancel());
        assertEquals("https://target.example.test", response.targetOriginSnapshot());
        assertEquals("chromium", response.browser());
        assertEquals("Smoke suite", response.suiteNameSnapshot());
        assertEquals("Checkout / đăng nhập", response.cases().getFirst().caseName());
        assertTrue(response.cases().getFirst().evidenceSuppressed());
        assertEquals("SECRET_VARIABLE_USED", response.cases().getFirst().evidenceSuppressionReason());
        assertTrue(response.artifacts().getFirst().secretSuppressed());
        assertEquals("smoke-suite-checkout-ang-nhap-" + execution.getId().toString().substring(0, 8)
                + "-step-3-screenshot.png", response.artifacts().getFirst().downloadFilename());

        when(artifacts.findByExecutionIdAndId(execution.getId(), artifact.getId())).thenReturn(Optional.of(artifact));
        ApiException suppressed = assertThrows(ApiException.class,
                () -> service.artifactDownload(jwt, project.getId(), execution.getId(), artifact.getId()));
        assertEquals("artifact_suppressed", suppressed.getCode());
        assertEquals(410, suppressed.getStatus().value());
        verify(artifactWriter, never()).resolve(any());
    }

    private ExecutionService serviceWith(PlatformProperties platformProperties) {
        return new ExecutionService(executions, caseResults, stepResults, artifacts, suites, cases, access,
                platformProperties, artifactWriter, queueGuard, variableSnapshots, projectVariables,
                stepSnapshots, testSteps);
    }
}
