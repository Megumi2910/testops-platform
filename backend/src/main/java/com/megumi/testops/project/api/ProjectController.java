package com.megumi.testops.project.api;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.megumi.testops.project.service.ProjectService;
import com.megumi.testops.shared.api.PageResponse;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {
    private final ProjectService service;
    public ProjectController(ProjectService service) { this.service = service; }
    @GetMapping public PageResponse<ProjectDtos.ProjectResponse> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size, @RequestParam(required = false) String q) { return service.list(jwt, page, size, q); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public ProjectDtos.ProjectResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProjectDtos.ProjectRequest request) { return service.create(jwt, request); }
    @GetMapping("/{id}") public ProjectDtos.ProjectResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.get(jwt, id); }
    @PutMapping("/{id}") public ProjectDtos.ProjectResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ProjectDtos.ProjectRequest request) { return service.update(jwt, id, request); }
    @PostMapping("/{id}/archive") public ProjectDtos.ProjectResponse archive(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.setArchived(jwt, id, true); }
    @PostMapping("/{id}/restore") public ProjectDtos.ProjectResponse restore(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.setArchived(jwt, id, false); }
    @GetMapping("/{id}/members") public List<ProjectDtos.MemberResponse> members(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.members(jwt, id); }
    @PostMapping("/{id}/members") @ResponseStatus(HttpStatus.CREATED) public ProjectDtos.MemberResponse addMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ProjectDtos.MemberRequest request) { return service.addMember(jwt, id, request); }
    @PutMapping("/{id}/members/{userId}") public ProjectDtos.MemberResponse changeMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId, @Valid @RequestBody ProjectDtos.MemberRoleRequest request) { return service.changeMember(jwt, id, userId, request); }
    @DeleteMapping("/{id}/members/{userId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void removeMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId, @RequestParam(required = false) Long projectVersion) { service.removeMember(jwt, id, userId, projectVersion); }
}
