package com.megumi.testops.project.api;

import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import com.megumi.testops.project.service.ProjectVariableService;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/variables")
public class ProjectVariableController {
    private final ProjectVariableService service;
    public ProjectVariableController(ProjectVariableService service) { this.service = service; }
    @GetMapping public List<ProjectDtos.VariableResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) { return service.list(jwt, projectId); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public ProjectDtos.VariableResponse create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @Valid @RequestBody ProjectDtos.VariableRequest request) { return service.create(jwt, projectId, request); }
    @PutMapping("/{key}") public ProjectDtos.VariableResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable String key, @Valid @RequestBody ProjectDtos.VariableRequest request) { return service.update(jwt, projectId, key, request); }
    @DeleteMapping("/{key}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable String key, @RequestParam(required = false) Long projectVersion, @RequestParam(required = false) Long variableVersion) { service.delete(jwt, projectId, key, projectVersion, variableVersion); }
}
