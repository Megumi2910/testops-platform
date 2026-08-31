package com.megumi.testops.project.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
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
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.auth.service.PlatformPermissionService;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.repository.ProjectAuditEventRepository;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectOnboardingRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.shared.api.ApiException;

class ProjectMembershipSecurityTest {
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final ProjectMemberRepository members = mock(ProjectMemberRepository.class);
    private final ProjectAuditEventRepository audits = mock(ProjectAuditEventRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectTargetPolicy targets = mock(ProjectTargetPolicy.class);
    private final PlatformPermissionService platformPermissions = mock(PlatformPermissionService.class);
    private final ProjectOnboardingRepository onboarding = mock(ProjectOnboardingRepository.class);
    private final UserEntity actor = mock(UserEntity.class);
    private final UUID actorId = UUID.randomUUID();
    private final Jwt jwt = Jwt.withTokenValue("membership-test").header("alg", "none")
            .subject(actorId.toString()).build();
    private ProjectEntity project;
    private ProjectService service;

    @BeforeEach
    void setUp() {
        when(actor.getId()).thenReturn(actorId);
        project = new ProjectEntity("Membership project", null, "https://target.example.test", actor, Instant.now());
        when(access.user(jwt)).thenReturn(actor);
        when(access.project(project.getId())).thenReturn(project);
        doNothing().when(access).requireProjectRole(eq(project), eq(actor), eq(jwt), any());
        service = new ProjectService(projects, members, audits, users, access, targets, platformPermissions,
                onboarding);
    }

    @Test
    void cannotDemoteTheFinalProjectManager() {
        ProjectMemberEntity manager = new ProjectMemberEntity(project, actor, "PROJECT_MANAGER", Instant.now());
        when(members.findByProjectIdAndUserId(project.getId(), actorId)).thenReturn(Optional.of(manager));
        when(members.countByProjectIdAndRole(project.getId(), "PROJECT_MANAGER")).thenReturn(1L);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.changeMember(jwt, project.getId(), actorId,
                        new ProjectDtos.MemberRoleRequest("TEST_MANAGER", project.getVersion())));

        assertEquals("final_project_manager", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        assertEquals("PROJECT_MANAGER", manager.getRole());
        verify(audits, never()).save(any());
    }

    @Test
    void cannotRemoveTheFinalProjectManager() {
        ProjectMemberEntity manager = new ProjectMemberEntity(project, actor, "PROJECT_MANAGER", Instant.now());
        when(members.findByProjectIdAndUserId(project.getId(), actorId)).thenReturn(Optional.of(manager));
        when(members.countByProjectIdAndRole(project.getId(), "PROJECT_MANAGER")).thenReturn(1L);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.removeMember(jwt, project.getId(), actorId, project.getVersion()));

        assertEquals("final_project_manager", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        verify(members, never()).delete(any());
        verify(audits, never()).save(any());
    }

    @Test
    void projectScopedLookupHidesForeignMemberIdentifiers() {
        UUID foreignUserId = UUID.randomUUID();
        when(members.findByProjectIdAndUserId(project.getId(), foreignUserId)).thenReturn(Optional.empty());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.removeMember(jwt, project.getId(), foreignUserId, project.getVersion()));

        assertEquals("member_not_found", failure.getCode());
        assertEquals(404, failure.getStatus().value());
        verify(members, never()).delete(any());
        verify(audits, never()).save(any());
    }

    @Test
    void projectManagerCanAddMemberWithNormalizedIdentityAndRole() {
        UUID memberId = UUID.randomUUID();
        UserEntity memberUser = mock(UserEntity.class);
        when(memberUser.getId()).thenReturn(memberId);
        when(memberUser.getEmail()).thenReturn("qa.member@example.test");
        when(memberUser.getDisplayName()).thenReturn("QA Member");
        when(users.findByEmail("qa.member@example.test")).thenReturn(Optional.of(memberUser));
        when(members.existsByProjectIdAndUserId(project.getId(), memberId)).thenReturn(false);
        when(members.save(any(ProjectMemberEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProjectDtos.MemberResponse response = service.addMember(jwt, project.getId(),
                new ProjectDtos.MemberRequest(" QA.MEMBER@EXAMPLE.TEST ", " test_manager ", project.getVersion()));

        assertEquals(memberId, response.userId());
        assertEquals("qa.member@example.test", response.email());
        assertEquals("TEST_MANAGER", response.role());
        assertEquals(actorId, response.assignedBy());
        assertEquals(ProjectService.permissionSet("TEST_MANAGER", false), response.permissions());
        verify(members).save(any(ProjectMemberEntity.class));
        verify(audits).save(any());
    }

    @Test
    void duplicateMemberIsRejectedBeforePersistence() {
        UserEntity memberUser = mock(UserEntity.class);
        UUID memberId = UUID.randomUUID();
        when(memberUser.getId()).thenReturn(memberId);
        when(users.findByEmail("qa.member@example.test")).thenReturn(Optional.of(memberUser));
        when(members.existsByProjectIdAndUserId(project.getId(), memberId)).thenReturn(true);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.addMember(jwt, project.getId(),
                        new ProjectDtos.MemberRequest("qa.member@example.test", "VIEWER", project.getVersion())));

        assertEquals("member_exists", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        verify(members, never()).save(any());
        verify(audits, never()).save(any());
    }

    @Test
    void projectManagerCanChangeAndRemoveNonManagerMember() {
        UserEntity memberUser = mock(UserEntity.class);
        UUID memberId = UUID.randomUUID();
        when(memberUser.getId()).thenReturn(memberId);
        when(memberUser.getEmail()).thenReturn("qa.member@example.test");
        when(memberUser.getDisplayName()).thenReturn("QA Member");
        ProjectMemberEntity member = new ProjectMemberEntity(project, memberUser, "TESTER", Instant.now());
        when(members.findByProjectIdAndUserId(project.getId(), memberId)).thenReturn(Optional.of(member));

        ProjectDtos.MemberResponse changed = service.changeMember(jwt, project.getId(), memberId,
                new ProjectDtos.MemberRoleRequest("VIEWER", project.getVersion()));
        service.removeMember(jwt, project.getId(), memberId, project.getVersion());

        assertEquals("VIEWER", changed.role());
        assertEquals(ProjectService.permissionSet("VIEWER", false), changed.permissions());
        assertEquals("VIEWER", member.getRole());
        verify(members).delete(member);
        verify(audits, org.mockito.Mockito.times(2)).save(any());
    }

    @Test
    void memberPermissionsComeFromEachMembersProjectRoleEvenForAnAdministratorCaller() {
        UserEntity managerUser = memberUser("manager@example.test", "Manager");
        UserEntity viewerUser = memberUser("viewer@example.test", "Viewer");
        ProjectMemberEntity manager = new ProjectMemberEntity(project, managerUser, "PROJECT_MANAGER", Instant.now());
        ProjectMemberEntity viewer = new ProjectMemberEntity(project, viewerUser, "VIEWER", Instant.now());
        when(access.globalAdmin(jwt)).thenReturn(true);
        when(members.findByProjectIdOrderByCreatedAtAsc(project.getId())).thenReturn(List.of(manager, viewer));

        List<ProjectDtos.MemberResponse> response = service.members(jwt, project.getId());

        assertEquals(ProjectService.permissionSet("PROJECT_MANAGER", false), response.get(0).permissions());
        assertEquals(ProjectService.permissionSet("VIEWER", false), response.get(1).permissions());
        assertFalse(response.get(1).permissions().contains(ProjectPermission.MEMBER_MANAGE.name()));
        assertFalse(response.get(1).permissions().contains(ProjectPermission.VARIABLE_MANAGE.name()));
        verify(access, never()).membership(project, actor);
    }

    @Test
    void archivedProjectRejectsEveryMemberMutation() {
        project.archive(Instant.now());
        UUID memberId = UUID.randomUUID();

        ApiException addFailure = assertThrows(ApiException.class,
                () -> service.addMember(jwt, project.getId(),
                        new ProjectDtos.MemberRequest("qa.member@example.test", "VIEWER", project.getVersion())));
        ApiException changeFailure = assertThrows(ApiException.class,
                () -> service.changeMember(jwt, project.getId(), memberId,
                        new ProjectDtos.MemberRoleRequest("VIEWER", project.getVersion())));
        ApiException removeFailure = assertThrows(ApiException.class,
                () -> service.removeMember(jwt, project.getId(), memberId, project.getVersion()));

        assertEquals("project_archived", addFailure.getCode());
        assertEquals("project_archived", changeFailure.getCode());
        assertEquals("project_archived", removeFailure.getCode());
        verify(members, never()).save(any());
        verify(members, never()).delete(any());
        verify(audits, never()).save(any());
    }

    @Test
    void nonManagerCannotMutateMembership() {
        ApiException denied = new ApiException(HttpStatus.FORBIDDEN, "project_role_required",
                "Your project role does not allow this operation");
        org.mockito.Mockito.doThrow(denied).when(access)
                .requireProjectRole(eq(project), eq(actor), eq(jwt), any());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.addMember(jwt, project.getId(),
                        new ProjectDtos.MemberRequest("qa.member@example.test", "VIEWER", project.getVersion())));

        assertEquals("project_role_required", failure.getCode());
        assertEquals(403, failure.getStatus().value());
        verify(users, never()).findByEmail(any());
        verify(members, never()).save(any());
    }

    private static UserEntity memberUser(String email, String displayName) {
        UserEntity member = mock(UserEntity.class);
        when(member.getId()).thenReturn(UUID.randomUUID());
        when(member.getEmail()).thenReturn(email);
        when(member.getDisplayName()).thenReturn(displayName);
        return member;
    }
}
