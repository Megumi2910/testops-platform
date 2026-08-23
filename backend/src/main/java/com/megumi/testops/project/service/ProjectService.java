package com.megumi.testops.project.service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectAuditEventEntity;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.repository.ProjectAuditEventRepository;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectOnboardingRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.shared.api.ApiException;
import com.megumi.testops.shared.api.PageResponse;

@Service
public class ProjectService {
    private final ProjectRepository projects; private final ProjectMemberRepository members; private final ProjectAuditEventRepository audits;
    private final UserRepository users; private final ProjectAccessService access; private final ProjectTargetPolicy targets;
    private final com.megumi.testops.auth.service.PlatformPermissionService platformPermissions;
    private final ProjectOnboardingRepository onboarding;
    public ProjectService(ProjectRepository projects, ProjectMemberRepository members, ProjectAuditEventRepository audits, UserRepository users, ProjectAccessService access, ProjectTargetPolicy targets, com.megumi.testops.auth.service.PlatformPermissionService platformPermissions, ProjectOnboardingRepository onboarding) {
        this.projects = projects; this.members = members; this.audits = audits; this.users = users; this.access = access; this.targets = targets; this.platformPermissions = platformPermissions; this.onboarding = onboarding;
    }

    @Transactional(readOnly = true)
    public PageResponse<ProjectDtos.ProjectResponse> list(Jwt jwt, int page, int size, String query) {
        UserEntity user = access.user(jwt);
        boolean globalAdmin = access.globalAdmin(jwt);
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.min(Math.max(1, size), 100);
        String normalizedQuery = query == null ? "" : query.trim();
        Page<ProjectEntity> result;
        if (globalAdmin) {
            PageRequest request = PageRequest.of(normalizedPage, normalizedSize, Sort.by("name").ascending());
            result = normalizedQuery.isBlank()
                    ? projects.findAll(request)
                    : projects.findByNameContainingIgnoreCase(normalizedQuery, request);
        } else {
            PageRequest request = PageRequest.of(normalizedPage, normalizedSize);
            result = members.findProjectsForUser(user.getId(), normalizedQuery, request);
        }
        List<UUID> projectIds = result.getContent().stream().map(ProjectEntity::getId).toList();
        java.util.Map<UUID, String> roles = globalAdmin || projectIds.isEmpty()
                ? java.util.Map.of()
                : members.findByUserIdAndProjectIdIn(user.getId(), projectIds).stream()
                        .collect(java.util.stream.Collectors.toMap(m -> m.getProject().getId(), ProjectMemberEntity::getRole));
        java.util.Map<UUID, ProjectDtos.ProjectOnboardingResponse> onboardingCounts = onboarding.findByProjectIds(projectIds);
        return new PageResponse<>(result.getContent().stream().map(p -> response(user, p, globalAdmin, roles, onboardingCounts)).toList(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public ProjectDtos.ProjectResponse create(Jwt jwt, ProjectDtos.ProjectRequest request) {
        UserEntity user = access.user(jwt); if (!targets.isConfigured()) throw error(HttpStatus.SERVICE_UNAVAILABLE, "project_creation_unconfigured", "Project creation is unavailable until a target allowlist is configured"); if (!platformPermissions.canCreateProject(user)) throw error(HttpStatus.FORBIDDEN, "project_creation_denied", "Only active, verified members can create projects");
        String name = request.name().trim(); if (projects.existsByNameIgnoreCase(name)) throw error(HttpStatus.CONFLICT, "project_name_taken", "Project name is already in use");
        Instant now = Instant.now(); ProjectEntity project = projects.save(new ProjectEntity(name, trim(request.description()), targets.validate(request.targetOrigin()), user, now));
        ProjectMemberEntity owner = new ProjectMemberEntity(project, user, "PROJECT_MANAGER", now); owner.assignBy(user); members.save(owner); audit(project, user, "PROJECT_CREATED"); return response(jwt, project);
    }

    @Transactional(readOnly = true)
    public ProjectDtos.ProjectResponse get(Jwt jwt, UUID id) { UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); if (!access.globalAdmin(jwt)) access.membership(project, user); return response(jwt, project); }
    @Transactional
    public ProjectDtos.ProjectResponse update(Jwt jwt, UUID id, ProjectDtos.ProjectRequest request) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, user, jwt, java.util.Set.of("PROJECT_MANAGER")); requireVersion(project.getVersion(), request.projectVersion());
        String name = request.name().trim(); if (!name.equalsIgnoreCase(project.getName()) && projects.existsByNameIgnoreCase(name)) throw error(HttpStatus.CONFLICT, "project_name_taken", "Project name is already in use");
        if ("ARCHIVED".equals(project.getStatus())) throw error(HttpStatus.CONFLICT, "project_archived", "Archived projects are read-only");
        project.update(name, trim(request.description()), targets.validate(request.targetOrigin()), Instant.now()); audit(project, user, "PROJECT_UPDATED"); return response(jwt, project);
    }
    @Transactional
    public ProjectDtos.ProjectResponse setArchived(Jwt jwt, UUID id, boolean archived, long version) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, user, jwt, java.util.Set.of("PROJECT_MANAGER")); requireVersion(project.getVersion(), version);
        if (archived) {
            if ("ARCHIVED".equals(project.getStatus())) throw error(HttpStatus.CONFLICT, "project_already_archived", "Project is already archived");
            project.archive(Instant.now());
        } else {
            if ("ACTIVE".equals(project.getStatus())) throw error(HttpStatus.CONFLICT, "project_not_archived", "Project is already active");
            project.restore(Instant.now());
        }
        projects.saveAndFlush(project);
        audit(project, user, archived ? "PROJECT_ARCHIVED" : "PROJECT_RESTORED"); return response(jwt, project);
    }
    @Transactional(readOnly = true)
    public List<ProjectDtos.MemberResponse> members(Jwt jwt, UUID id) { UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); if (!access.globalAdmin(jwt)) access.membership(project, user); return members.findByProjectIdOrderByCreatedAtAsc(id).stream().map(ProjectService::memberResponse).toList(); }
    @Transactional
    public ProjectDtos.MemberResponse addMember(Jwt jwt, UUID id, ProjectDtos.MemberRequest request) {
        UserEntity actor = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, actor, jwt, java.util.Set.of("PROJECT_MANAGER")); ensureActive(project); requireVersion(project.getVersion(), request.projectVersion());
        UserEntity user = users.findByEmail(request.email().trim().toLowerCase(Locale.ROOT)).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "user_not_found", "User was not found")); String role = role(request.role());
        if (members.existsByProjectIdAndUserId(id, user.getId())) throw error(HttpStatus.CONFLICT, "member_exists", "User is already a project member");
        ProjectMemberEntity member = new ProjectMemberEntity(project, user, role, Instant.now()); member.assignBy(actor); members.save(member); project.touch(Instant.now()); audit(project, actor, "MEMBER_ADDED"); return memberResponse(member);
    }
    @Transactional
    public ProjectDtos.MemberResponse changeMember(Jwt jwt, UUID id, UUID userId, ProjectDtos.MemberRoleRequest request) {
        UserEntity actor = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, actor, jwt, java.util.Set.of("PROJECT_MANAGER")); ensureActive(project); requireVersion(project.getVersion(), request.projectVersion());
        ProjectMemberEntity member = members.findByProjectIdAndUserId(id, userId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "member_not_found", "Member was not found")); String role = role(request.role());
        if ("PROJECT_MANAGER".equals(member.getRole()) && !"PROJECT_MANAGER".equals(role) && members.countByProjectIdAndRole(id, "PROJECT_MANAGER") <= 1) throw error(HttpStatus.CONFLICT, "final_project_manager", "A project must always have a project manager");
        member.changeRole(role, Instant.now()); project.touch(Instant.now()); audit(project, actor, "MEMBER_ROLE_CHANGED"); return memberResponse(member);
    }
    @Transactional
    public void removeMember(Jwt jwt, UUID id, UUID userId, Long projectVersion) {
        UserEntity actor = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, actor, jwt, java.util.Set.of("PROJECT_MANAGER")); ensureActive(project); requireVersion(project.getVersion(), projectVersion);
        ProjectMemberEntity member = members.findByProjectIdAndUserId(id, userId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "member_not_found", "Member was not found")); if ("PROJECT_MANAGER".equals(member.getRole()) && members.countByProjectIdAndRole(id, "PROJECT_MANAGER") <= 1) throw error(HttpStatus.CONFLICT, "final_project_manager", "A project must always have a project manager"); members.delete(member); project.touch(Instant.now()); audit(project, actor, "MEMBER_REMOVED");
    }
    private void audit(ProjectEntity project, UserEntity user, String event) { audits.save(new ProjectAuditEventEntity(project, user, event, "{}", Instant.now())); }
    private ProjectDtos.ProjectResponse response(Jwt jwt, ProjectEntity p) {
        UserEntity user = access.user(jwt);
        return response(user, p, access.globalAdmin(jwt), java.util.Map.of());
    }
    private ProjectDtos.ProjectResponse response(UserEntity user, ProjectEntity p, boolean globalAdmin,
            java.util.Map<UUID, String> roles) {
        return response(user, p, globalAdmin, roles, onboarding.findByProjectIds(java.util.List.of(p.getId())));
    }
    private ProjectDtos.ProjectResponse response(UserEntity user, ProjectEntity p, boolean globalAdmin,
            java.util.Map<UUID, String> roles,
            java.util.Map<UUID, ProjectDtos.ProjectOnboardingResponse> onboardingCounts) {
        String role = globalAdmin ? "ADMIN" : roles.containsKey(p.getId())
                ? roles.get(p.getId())
                : members.findByProjectIdAndUserId(p.getId(), user.getId()).map(ProjectMemberEntity::getRole).orElse(null);
        java.util.Set<String> permissions = permissionSet(role, globalAdmin);
        ProjectDtos.ProjectOnboardingResponse projectOnboarding = onboardingCounts.getOrDefault(p.getId(),
                new ProjectDtos.ProjectOnboardingResponse(0, 0, 0, 0));
        return new ProjectDtos.ProjectResponse(p.getId(), p.getName(), p.getDescription(), p.getTargetOrigin(), p.getStatus(), p.getVersion(), p.getCreatedAt(), p.getUpdatedAt(), role, permissions,
                new ProjectDtos.TargetHealthResponse(p.getTargetCheckStatus(), p.getTargetCheckHttpStatus(), p.getTargetCheckedAt(), p.getTargetCheckReason()),
                projectOnboarding);
    }
    static java.util.Set<String> permissionSet(String role, boolean admin) {
        if (admin) return java.util.Arrays.stream(ProjectPermission.values()).map(Enum::name).collect(java.util.stream.Collectors.toUnmodifiableSet());
        java.util.EnumSet<ProjectPermission> set = java.util.EnumSet.noneOf(ProjectPermission.class);
        if (role == null) return java.util.Set.of();
        set.add(ProjectPermission.PROJECT_VIEW); set.add(ProjectPermission.DEFINITION_VIEW); set.add(ProjectPermission.EXECUTION_VIEW); set.add(ProjectPermission.ARTIFACT_VIEW);
        if ("PROJECT_MANAGER".equals(role)) set.addAll(java.util.EnumSet.of(ProjectPermission.PROJECT_UPDATE, ProjectPermission.PROJECT_ARCHIVE, ProjectPermission.MEMBER_MANAGE, ProjectPermission.VARIABLE_VIEW, ProjectPermission.VARIABLE_MANAGE, ProjectPermission.DEFINITION_MANAGE, ProjectPermission.EXECUTION_START, ProjectPermission.EXECUTION_CANCEL_OWN, ProjectPermission.EXECUTION_CANCEL_ANY));
        if ("TEST_MANAGER".equals(role)) set.addAll(java.util.EnumSet.of(ProjectPermission.DEFINITION_MANAGE, ProjectPermission.EXECUTION_START, ProjectPermission.EXECUTION_CANCEL_OWN));
        if ("TESTER".equals(role)) set.addAll(java.util.EnumSet.of(ProjectPermission.EXECUTION_START, ProjectPermission.EXECUTION_CANCEL_OWN));
        return set.stream().map(Enum::name).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }
    private static ProjectDtos.MemberResponse memberResponse(ProjectMemberEntity m) { return new ProjectDtos.MemberResponse(m.getUser().getId(), m.getUser().getEmail(), m.getUser().getDisplayName(), m.getRole(), m.getVersion(), m.getAssignedBy() == null ? null : m.getAssignedBy().getId(), permissionSet(m.getRole(), false)); }
    private static void requireVersion(long current, Long expected) { if (expected != null && current != expected) throw error(HttpStatus.CONFLICT, "stale_version", "The resource changed; reload and try again"); }
    private static String role(String value) { String role = value == null ? "" : value.trim().toUpperCase(Locale.ROOT); if (!java.util.Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER", "VIEWER").contains(role)) throw error(HttpStatus.BAD_REQUEST, "invalid_project_role", "Role must be PROJECT_MANAGER, TEST_MANAGER, TESTER, or VIEWER"); return role; }
    private static void ensureActive(ProjectEntity p) { if ("ARCHIVED".equals(p.getStatus())) throw error(HttpStatus.CONFLICT, "project_archived", "Archived projects are read-only"); }
    private static String trim(String value) { return value == null ? null : value.trim(); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
}
