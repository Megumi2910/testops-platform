package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.project.service.ProjectAccessService;
import com.megumi.testops.project.service.ProjectTargetPolicy;
import com.megumi.testops.project.service.TargetCheckService;
import com.megumi.testops.project.service.TargetProbe;
import com.megumi.testops.shared.api.ApiException;

class TargetCheckServiceTest {
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final TargetProbe probe = mock(TargetProbe.class);
    private final ProjectTargetPolicy policy = mock(ProjectTargetPolicy.class);
    private final TargetCheckService service = new TargetCheckService(access, projects, probe, policy);

    @Test
    void recordsReachableTargetHealthWithoutPageContent() {
        Instant now = Instant.now();
        UserEntity user = user("target-check@example.test");
        ProjectEntity project = new ProjectEntity("Local target", null, "http://localhost:3001", user, now);
        Jwt jwt = jwtFor(user);
        UUID id = project.getId();

        when(access.user(jwt)).thenReturn(user);
        when(access.project(id)).thenReturn(project);
        doNothing().when(access).requireProjectRole(eq(project), eq(user), eq(jwt), anySet());
        when(policy.validate(project.getTargetOrigin())).thenReturn(project.getTargetOrigin());
        when(probe.probe(project.getTargetOrigin())).thenReturn(new TargetProbe.ProbeResult(true, 200, null));

        ProjectDtos.TargetCheckResponse response = service.check(jwt, id);

        assertEquals(id, response.projectId());
        assertEquals("REACHABLE", response.status());
        assertEquals(200, response.httpStatus());
        assertNull(response.reason());
        assertEquals("REACHABLE", project.getTargetCheckStatus());
        verify(projects).save(project);
    }

    @Test
    void recordsBlockedReasonWhenTargetPolicyRejectsOrigin() {
        Instant now = Instant.now();
        UserEntity user = user("blocked-target@example.test");
        ProjectEntity project = new ProjectEntity("Blocked target", null, "http://127.0.0.1:3001", user, now);
        Jwt jwt = jwtFor(user);
        UUID id = project.getId();

        when(access.user(jwt)).thenReturn(user);
        when(access.project(id)).thenReturn(project);
        doNothing().when(access).requireProjectRole(eq(project), eq(user), eq(jwt), anySet());
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "target_not_allowlisted", "Target is not allowlisted"))
                .when(policy).validate(project.getTargetOrigin());

        ProjectDtos.TargetCheckResponse response = service.check(jwt, id);

        assertEquals("BLOCKED", response.status());
        assertEquals("target_not_allowlisted", response.reason());
        assertNull(response.httpStatus());
        verify(probe, never()).probe(any());
        verify(projects).save(project);
    }

    @Test
    void doesNotPersistWhenMemberLacksExecutionRole() {
        Instant now = Instant.now();
        UserEntity user = user("viewer@example.test");
        ProjectEntity project = new ProjectEntity("Viewer target", null, "https://example.test", user, now);
        Jwt jwt = jwtFor(user);
        UUID id = project.getId();

        when(access.user(jwt)).thenReturn(user);
        when(access.project(id)).thenReturn(project);
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "project_role_required", "Execution permission is required"))
                .when(access).requireProjectRole(eq(project), eq(user), eq(jwt), anySet());

        org.junit.jupiter.api.Assertions.assertThrows(ApiException.class, () -> service.check(jwt, id));

        verify(policy, never()).validate(any());
        verify(probe, never()).probe(any());
        verify(projects, never()).save(any());
    }

    private static Jwt jwtFor(UserEntity user) {
        return Jwt.withTokenValue("test-token").header("alg", "none").subject(user.getId().toString()).build();
    }

    private static UserEntity user(String email) {
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        when(user.getEmail()).thenReturn(email);
        return user;
    }
}
