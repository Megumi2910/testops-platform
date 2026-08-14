package com.megumi.testops.project.service;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.shared.api.ApiException;
import org.springframework.http.HttpStatus;

@Service
public class TargetCheckService {
    private final ProjectAccessService access;
    private final ProjectRepository projects;
    private final TargetProbe targetProbe;
    private final ProjectTargetPolicy policy;

    public TargetCheckService(ProjectAccessService access, ProjectRepository projects, TargetProbe targetProbe, ProjectTargetPolicy policy) {
        this.access = access; this.projects = projects; this.targetProbe = targetProbe; this.policy = policy;
    }

    @Transactional
    public ProjectDtos.TargetCheckResponse check(Jwt jwt, UUID id) {
        var user = access.user(jwt); ProjectEntity project = access.project(id);
        access.requireProjectRole(project, user, jwt, Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER"));
        String status; Integer httpStatus = null; String reason = null;
        try {
            policy.validate(project.getTargetOrigin());
            var probe = targetProbe.probe(project.getTargetOrigin());
            httpStatus = probe.httpStatus(); status = probe.reachable() ? "REACHABLE" : "UNREACHABLE"; reason = probe.reason();
        } catch (ApiException ex) { status = "BLOCKED"; reason = ex.getCode(); }
        Instant checkedAt = Instant.now(); project.recordTargetCheck(status, httpStatus, reason, checkedAt); projects.save(project);
        return new ProjectDtos.TargetCheckResponse(id, status, httpStatus, checkedAt, reason);
    }
}
