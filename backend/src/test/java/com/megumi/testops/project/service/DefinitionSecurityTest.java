package com.megumi.testops.project.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.repository.TestCaseRepository;
import com.megumi.testops.project.repository.TestStepRepository;
import com.megumi.testops.project.repository.TestSuiteRepository;
import com.megumi.testops.shared.api.ApiException;

class DefinitionSecurityTest {
    private final TestSuiteRepository suites = mock(TestSuiteRepository.class);
    private final TestCaseRepository cases = mock(TestCaseRepository.class);
    private final TestStepRepository steps = mock(TestStepRepository.class);
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final UserEntity user = mock(UserEntity.class);
    private final UUID userId = UUID.randomUUID();
    private final Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();
    private ProjectEntity project;
    private DefinitionService service;

    @BeforeEach
    void setUp() {
        when(user.getId()).thenReturn(userId);
        project = new ProjectEntity("Primary", null, "https://target.example.test", user, Instant.now());
        when(access.user(jwt)).thenReturn(user);
        when(access.project(project.getId())).thenReturn(project);
        when(access.globalAdmin(jwt)).thenReturn(false);
        service = new DefinitionService(suites, cases, steps, access);
    }

    @Test
    void rejectsCaseReadWhenSuiteDoesNotBelongToRequestedProject() {
        UUID foreignSuiteId = UUID.randomUUID();

        ApiException failure = assertThrows(ApiException.class,
                () -> service.getCase(jwt, project.getId(), foreignSuiteId, UUID.randomUUID()));

        assertEquals("suite_not_found", failure.getCode());
        verify(access).membership(project, user);
        verify(cases, never()).findByIdAndSuiteId(any(), any());
    }

    @Test
    void rejectsCaseReadWhenCaseDoesNotBelongToRequestedSuite() {
        TestSuiteEntity suite = new TestSuiteEntity(project, "Primary suite", null, user, Instant.now());
        UUID foreignCaseId = UUID.randomUUID();
        when(suites.findByIdAndProjectId(suite.getId(), project.getId())).thenReturn(Optional.of(suite));
        when(cases.findByIdAndSuiteId(foreignCaseId, suite.getId())).thenReturn(Optional.empty());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.getCase(jwt, project.getId(), suite.getId(), foreignCaseId));

        assertEquals("case_not_found", failure.getCode());
        verify(steps, never()).findByTestCaseIdOrderByPositionAsc(any());
    }

    @Test
    void rejectsCaseMutationWhenCaseDoesNotBelongToRequestedSuite() {
        TestSuiteEntity suite = new TestSuiteEntity(project, "Primary suite", null, user, Instant.now());
        UUID foreignCaseId = UUID.randomUUID();
        when(suites.findByIdAndProjectId(suite.getId(), project.getId())).thenReturn(Optional.of(suite));
        when(cases.findByIdAndSuiteId(foreignCaseId, suite.getId())).thenReturn(Optional.empty());
        ProjectDtos.CaseRequest request = new ProjectDtos.CaseRequest("Updated", null, "DRAFT", "MEDIUM", null,
                0, true, null, List.of());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.updateCase(jwt, project.getId(), suite.getId(), foreignCaseId, request));

        assertEquals("case_not_found", failure.getCode());
        verify(cases, never()).save(any());
        verify(steps, never()).deleteByTestCaseId(any());
    }

    @Test
    void rejectsCaseCreationUnderArchivedSuite() {
        TestSuiteEntity suite = new TestSuiteEntity(project, "Archived", null, user, Instant.now());
        suite.archive(Instant.now());
        when(suites.findByIdAndProjectId(suite.getId(), project.getId())).thenReturn(Optional.of(suite));
        ProjectDtos.CaseRequest request = new ProjectDtos.CaseRequest("Draft", null, "DRAFT", "MEDIUM", null,
                0, true, null, List.of());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.createCase(jwt, project.getId(), suite.getId(), request));

        assertEquals("suite_archived", failure.getCode());
        verify(access).requireProjectRole(eq(project), eq(user), eq(jwt), eq(Set.of("PROJECT_MANAGER", "TEST_MANAGER")));
        verify(cases, never()).save(any());
    }

    @Test
    void archivesSuiteWithActorAndRestoresItWithoutChangingChildren() {
        TestSuiteEntity suite = new TestSuiteEntity(project, "Lifecycle", null, user, Instant.now());
        when(suites.findByIdAndProjectId(suite.getId(), project.getId())).thenReturn(Optional.of(suite));

        ProjectDtos.SuiteResponse archived = service.archiveSuite(jwt, project.getId(), suite.getId(), 0L);

        assertEquals("ARCHIVED", archived.status());
        assertEquals(userId, archived.archivedBy());
        when(suites.existsByProjectIdAndNameIgnoreCaseAndStatusNot(project.getId(), "Lifecycle", "ARCHIVED"))
                .thenReturn(false);

        ProjectDtos.SuiteResponse restored = service.restoreSuite(jwt, project.getId(), suite.getId(),
                new ProjectDtos.RestoreRequest(0L, null));

        assertEquals("ACTIVE", restored.status());
        assertEquals(null, restored.archivedAt());
    }

    @Test
    void caseRestoreReturnsToDraftAndSupportsConflictRename() {
        TestSuiteEntity suite = new TestSuiteEntity(project, "Cases", null, user, Instant.now());
        TestCaseEntity testCase = new TestCaseEntity(suite, "Reusable", null, "READY", "HIGH", null, 0, true,
                user, Instant.now());
        testCase.archive(user, Instant.now());
        when(suites.findByIdAndProjectId(suite.getId(), project.getId())).thenReturn(Optional.of(suite));
        when(cases.findByIdAndSuiteId(testCase.getId(), suite.getId())).thenReturn(Optional.of(testCase));
        when(cases.existsBySuiteIdAndNameIgnoreCaseAndStatusNot(suite.getId(), "Reusable", "ARCHIVED"))
                .thenReturn(true);

        ApiException conflict = assertThrows(ApiException.class,
                () -> service.restoreCase(jwt, project.getId(), suite.getId(), testCase.getId(),
                        new ProjectDtos.RestoreRequest(0L, null)));
        assertEquals("case_restore_name_conflict", conflict.getCode());

        when(cases.existsBySuiteIdAndNameIgnoreCaseAndStatusNot(suite.getId(), "Renamed", "ARCHIVED"))
                .thenReturn(false);
        when(steps.findByTestCaseIdOrderByPositionAsc(testCase.getId())).thenReturn(List.of());
        ProjectDtos.CaseResponse restored = service.restoreCase(jwt, project.getId(), suite.getId(), testCase.getId(),
                new ProjectDtos.RestoreRequest(0L, "Renamed"));

        assertEquals("DRAFT", restored.status());
        assertEquals("Renamed", restored.name());
        assertEquals(null, restored.archivedAt());
    }
}
