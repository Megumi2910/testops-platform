package com.megumi.testops.project.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.config.ProjectProperties;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectVariableEntity;
import com.megumi.testops.project.repository.ProjectVariableRepository;
import com.megumi.testops.project.repository.TestStepRepository;
import com.megumi.testops.shared.api.ApiException;

class ProjectVariableServiceTest {
    private final ProjectVariableRepository variables = mock(ProjectVariableRepository.class);
    private final TestStepRepository steps = mock(TestStepRepository.class);
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectVariableCrypto crypto = mock(ProjectVariableCrypto.class);
    private final ProjectProperties properties = mock(ProjectProperties.class);
    private final UserEntity user = mock(UserEntity.class);
    private final UUID userId = UUID.randomUUID();
    private final Jwt jwt = Jwt.withTokenValue("variable-test").header("alg", "none")
            .subject(userId.toString()).build();
    private ProjectEntity project;
    private ProjectVariableService service;

    @BeforeEach
    void setUp() {
        project = new ProjectEntity("Variables", null, "https://target.example.test", user, Instant.now());
        when(access.user(jwt)).thenReturn(user);
        when(access.project(project.getId())).thenReturn(project);
        when(properties.variableKeyVersion()).thenReturn(1);
        service = new ProjectVariableService(variables, steps, access, crypto, properties);
    }

    @Test
    void listRequiresVariableViewPermissionAndAlwaysMasksSecrets() {
        ProjectVariableEntity secret = secret("PASSWORD");
        when(variables.findByProjectIdOrderByKeyAsc(project.getId())).thenReturn(List.of(secret));

        var response = service.list(jwt, project.getId());

        verify(access).requireProjectPermission(eq(project), eq(user), eq(jwt), eq(ProjectPermission.VARIABLE_VIEW));
        assertEquals(1, response.size());
        assertNull(response.getFirst().value());
    }

    @Test
    void createRejectsAStaleProjectVersionBeforePersistence() {
        ApiException failure = assertThrows(ApiException.class,
                () -> service.create(jwt, project.getId(),
                        new ProjectDtos.VariableRequest("BASE_URL", false, "https://example.test", 1L, null)));

        assertEquals("stale_version", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        verify(variables, never()).save(any());
    }

    @Test
    void secretCreateIsExplicitlyRejectedWhenSecretVariablesAreDisabled() {
        when(properties.secretVariablesEnabled()).thenReturn(false);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.create(jwt, project.getId(),
                        new ProjectDtos.VariableRequest("PASSWORD", true, "sensitive", project.getVersion(), null)));

        assertEquals("secret_variables_disabled", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        verify(crypto, never()).encrypt(any(), any(), any(), any(Integer.class));
        verify(variables, never()).save(any());
    }

    @Test
    void updatePlainVariableHonorsProjectAndVariableVersions() {
        ProjectVariableEntity variable = ProjectVariableEntity.plain(project, "BASE_URL", "old", Instant.now());
        when(variables.findByProjectIdAndKey(project.getId(), "BASE_URL")).thenReturn(Optional.of(variable));

        ProjectDtos.VariableResponse response = service.update(jwt, project.getId(), "base_url",
                new ProjectDtos.VariableRequest("BASE_URL", false, "new", project.getVersion(),
                        variable.getVersion()));

        assertEquals("new", response.value());
        verify(access).requireProjectPermission(eq(project), eq(user), eq(jwt), eq(ProjectPermission.VARIABLE_MANAGE));
        verify(variables).saveAndFlush(variable);
    }

    @Test
    void updateRejectsAStaleVariableVersionWithoutChangingItsValue() {
        ProjectVariableEntity variable = ProjectVariableEntity.plain(project, "BASE_URL", "old", Instant.now());
        when(variables.findByProjectIdAndKey(project.getId(), "BASE_URL")).thenReturn(Optional.of(variable));

        ApiException failure = assertThrows(ApiException.class,
                () -> service.update(jwt, project.getId(), "BASE_URL",
                        new ProjectDtos.VariableRequest("BASE_URL", false, "new", project.getVersion(), 1L)));

        assertEquals("stale_version", failure.getCode());
        assertEquals("old", variable.getPlaintextValue());
    }

    @Test
    void secretUpdateIsExplicitlyRejectedWhenSecretVariablesAreDisabled() {
        ProjectVariableEntity secret = secret("PASSWORD");
        when(variables.findByProjectIdAndKey(project.getId(), "PASSWORD")).thenReturn(Optional.of(secret));
        when(properties.secretVariablesEnabled()).thenReturn(false);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.update(jwt, project.getId(), "PASSWORD",
                        new ProjectDtos.VariableRequest("PASSWORD", true, "replacement", project.getVersion(),
                                secret.getVersion())));

        assertEquals("secret_variables_disabled", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        verify(crypto, never()).encrypt(any(), any(), any(), any(Integer.class));
    }

    @Test
    void updateCannotChangeAVariablesSecretClassification() {
        ProjectVariableEntity variable = ProjectVariableEntity.plain(project, "BASE_URL", "old", Instant.now());
        when(variables.findByProjectIdAndKey(project.getId(), "BASE_URL")).thenReturn(Optional.of(variable));

        ApiException failure = assertThrows(ApiException.class,
                () -> service.update(jwt, project.getId(), "BASE_URL",
                        new ProjectDtos.VariableRequest("BASE_URL", true, "replacement", project.getVersion(),
                                variable.getVersion())));

        assertEquals("variable_classification_immutable", failure.getCode());
        assertEquals(400, failure.getStatus().value());
        verify(variables, never()).saveAndFlush(any());
    }

    @Test
    void referencedVariableCannotBeDeletedAndConflictDoesNotLeakSensitiveContext() {
        ProjectVariableEntity secret = secret("PASSWORD");
        when(variables.findByProjectIdAndKey(project.getId(), "PASSWORD")).thenReturn(Optional.of(secret));
        when(steps.countVariableReferences(project.getId(), "${PASSWORD}")).thenReturn(2L);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.delete(jwt, project.getId(), "password", project.getVersion(), secret.getVersion()));

        assertEquals("variable_in_use", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        assertEquals("Variable is referenced by one or more test steps. Remove those references before deleting it",
                failure.getMessage());
        assertFalse(failure.getMessage().contains("PASSWORD"));
        assertFalse(failure.getMessage().contains("replacement"));
        verify(variables, never()).delete(any());
    }

    @Test
    void unreferencedVariableDeletionUsesOnlyTheCurrentProjectScope() {
        ProjectVariableEntity variable = ProjectVariableEntity.plain(project, "BASE_URL", "value", Instant.now());
        UUID foreignProjectId = UUID.randomUUID();
        when(variables.findByProjectIdAndKey(project.getId(), "BASE_URL")).thenReturn(Optional.of(variable));
        when(steps.countVariableReferences(project.getId(), "${BASE_URL}")).thenReturn(0L);
        when(steps.countVariableReferences(foreignProjectId, "${BASE_URL}")).thenReturn(1L);

        service.delete(jwt, project.getId(), "BASE_URL", project.getVersion(), variable.getVersion());

        verify(steps).countVariableReferences(project.getId(), "${BASE_URL}");
        verify(steps, never()).countVariableReferences(foreignProjectId, "${BASE_URL}");
        verify(variables).delete(variable);
    }

    @Test
    void referenceQueryCoversEveryInterpolatedFieldWithoutExcludingArchivedCases() throws Exception {
        Query query = TestStepRepository.class
                .getMethod("countVariableReferences", UUID.class, String.class)
                .getAnnotation(Query.class);
        String jpql = query.value();

        assertTrue(jpql.contains("step.testCase.suite.project.id = :projectId"));
        assertTrue(jpql.contains("step.locatorValue"));
        assertTrue(jpql.contains("step.inputValue"));
        assertTrue(jpql.contains("step.expectedValue"));
        assertFalse(jpql.toLowerCase().contains("status"));
        assertFalse(jpql.toLowerCase().contains("archived"));
    }

    private ProjectVariableEntity secret(String key) {
        return ProjectVariableEntity.encrypted(project, key, new byte[] { 1 }, new byte[] { 2 }, 1, Instant.now());
    }
}
