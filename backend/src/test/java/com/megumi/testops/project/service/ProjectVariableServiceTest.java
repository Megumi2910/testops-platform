package com.megumi.testops.project.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.config.ProjectProperties;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectVariableEntity;
import com.megumi.testops.project.repository.ProjectVariableRepository;

class ProjectVariableServiceTest {
    @Test
    void listRequiresVariableViewRoleAndAlwaysMasksSecrets() {
        ProjectVariableRepository variables = mock(ProjectVariableRepository.class);
        ProjectAccessService access = mock(ProjectAccessService.class);
        ProjectVariableCrypto crypto = mock(ProjectVariableCrypto.class);
        ProjectProperties properties = mock(ProjectProperties.class);
        UserEntity user = mock(UserEntity.class);
        UUID userId = UUID.randomUUID();
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();
        ProjectEntity project = new ProjectEntity("Variables", null, "https://target.example.test", user, Instant.now());
        ProjectVariableEntity secret = ProjectVariableEntity.encrypted(project, "PASSWORD", new byte[] { 1 },
                new byte[] { 2 }, 1, Instant.now());
        when(access.user(jwt)).thenReturn(user);
        when(access.project(project.getId())).thenReturn(project);
        when(variables.findByProjectIdOrderByKeyAsc(project.getId())).thenReturn(List.of(secret));
        ProjectVariableService service = new ProjectVariableService(variables, access, crypto, properties);

        var response = service.list(jwt, project.getId());

        verify(access).requireProjectRole(eq(project), eq(user), eq(jwt), eq(Set.of("PROJECT_MANAGER")));
        assertEquals(1, response.size());
        assertEquals(null, response.getFirst().value());
    }
}
