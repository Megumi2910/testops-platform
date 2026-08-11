package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
        TestStepEntity step = new TestStepEntity(testCase, 1, "NAVIGATE", null, null, null, "/", null, 5000, Instant.now());
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
        assertEquals("/", stepSnapshot.getInputValue());
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

        artifact.markPurged(Instant.now(), "RETENTION");
        ApiException error = assertThrows(ApiException.class,
                () -> service.artifactDownload(jwt, project.getId(), execution.getId(), artifact.getId()));
        assertEquals("artifact_purged", error.getCode());
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
        when(executions.findByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));
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
        when(executions.findByProjectIdAndId(project.getId(), execution.getId())).thenReturn(Optional.of(execution));

        assertSame(execution, service.cancel(jwt, project.getId(), execution.getId()));
        verify(access, never()).membership(project, user);
    }

    @Test
    void crossProjectExecutionIdentifierIsHiddenBeforeOwnershipChecks() {
        UUID foreignExecutionId = UUID.randomUUID();
        when(executions.findByProjectIdAndId(project.getId(), foreignExecutionId)).thenReturn(Optional.empty());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.cancel(jwt, project.getId(), foreignExecutionId));

        assertEquals("execution_not_found", failure.getCode());
        assertEquals(404, failure.getStatus().value());
        verify(access, never()).membership(eq(project), any());
    }
}
