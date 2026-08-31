package com.megumi.testops.project.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.shared.api.ApiException;

class ProjectAccessServiceTest {
    private static final Set<String> PROJECT_MANAGE = Set.of("PROJECT_MANAGER");
    private static final Set<String> DEFINITION_MANAGE = Set.of("PROJECT_MANAGER", "TEST_MANAGER");
    private static final Set<String> EXECUTION_START = Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER");

    private final UserRepository users = mock(UserRepository.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final ProjectMemberRepository members = mock(ProjectMemberRepository.class);
    private final ProjectAccessService access = new ProjectAccessService(users, projects, members);
    private final UserEntity user = mock(UserEntity.class);
    private final UUID userId = UUID.randomUUID();
    private final ProjectEntity project = new ProjectEntity(
            "Permission matrix", null, "https://permission.example.test", user, Instant.now());
    private final Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();

    @BeforeEach
    void setUp() {
        when(user.getId()).thenReturn(userId);
    }

    @ParameterizedTest(name = "{0} {1}: allowed={2}")
    @MethodSource("roleOperations")
    void projectRoleGuardMatchesThePublishedOperationMatrix(String role, Set<String> allowedRoles, boolean allowed) {
        when(members.findByProjectIdAndUserId(project.getId(), userId))
                .thenReturn(Optional.of(new ProjectMemberEntity(project, user, role, Instant.now())));

        if (allowed) {
            assertDoesNotThrow(() -> access.requireProjectRole(project, user, jwt, allowedRoles));
        } else {
            ApiException failure = assertThrows(ApiException.class,
                    () -> access.requireProjectRole(project, user, jwt, allowedRoles));
            assertEquals("project_role_required", failure.getCode());
        }
    }

    @Test
    void nonMemberCannotUseAProjectRoleGuard() {
        when(members.findByProjectIdAndUserId(project.getId(), userId)).thenReturn(Optional.empty());

        ApiException failure = assertThrows(ApiException.class,
                () -> access.requireProjectRole(project, user, jwt, EXECUTION_START));

        assertEquals("project_access_denied", failure.getCode());
    }

    @Test
    void globalAdministratorBypassesProjectMembershipForManagedOperations() {
        Jwt administrator = Jwt.withTokenValue("admin").header("alg", "none").subject(userId.toString())
                .claim("roles", List.of("ADMIN")).build();

        assertDoesNotThrow(() -> access.requireProjectRole(project, user, administrator, PROJECT_MANAGE));
    }

    @ParameterizedTest(name = "{0} variable permission {1}: allowed={2}")
    @MethodSource("variablePermissions")
    void variablePermissionsMatchThePublishedProjectContract(String role, ProjectPermission permission, boolean allowed) {
        when(members.findByProjectIdAndUserId(project.getId(), userId))
                .thenReturn(Optional.of(new ProjectMemberEntity(project, user, role, Instant.now())));

        if (allowed) {
            assertDoesNotThrow(() -> access.requireProjectPermission(project, user, jwt, permission));
        } else {
            ApiException failure = assertThrows(ApiException.class,
                    () -> access.requireProjectPermission(project, user, jwt, permission));
            assertEquals("project_permission_required", failure.getCode());
        }
    }

    private static Stream<Arguments> variablePermissions() {
        return Stream.of(
                Arguments.of("PROJECT_MANAGER", ProjectPermission.VARIABLE_VIEW, true),
                Arguments.of("PROJECT_MANAGER", ProjectPermission.VARIABLE_MANAGE, true),
                Arguments.of("TEST_MANAGER", ProjectPermission.VARIABLE_VIEW, false),
                Arguments.of("TESTER", ProjectPermission.VARIABLE_MANAGE, false),
                Arguments.of("VIEWER", ProjectPermission.VARIABLE_VIEW, false));
    }

    private static Stream<Arguments> roleOperations() {
        return Stream.of(
                operation("PROJECT_MANAGER", PROJECT_MANAGE, true),
                operation("TEST_MANAGER", PROJECT_MANAGE, false),
                operation("TESTER", PROJECT_MANAGE, false),
                operation("VIEWER", PROJECT_MANAGE, false),
                operation("PROJECT_MANAGER", DEFINITION_MANAGE, true),
                operation("TEST_MANAGER", DEFINITION_MANAGE, true),
                operation("TESTER", DEFINITION_MANAGE, false),
                operation("VIEWER", DEFINITION_MANAGE, false),
                operation("PROJECT_MANAGER", EXECUTION_START, true),
                operation("TEST_MANAGER", EXECUTION_START, true),
                operation("TESTER", EXECUTION_START, true),
                operation("VIEWER", EXECUTION_START, false));
    }

    private static Arguments operation(String role, Set<String> allowedRoles, boolean allowed) {
        return Arguments.of(role, allowedRoles, allowed);
    }
}
