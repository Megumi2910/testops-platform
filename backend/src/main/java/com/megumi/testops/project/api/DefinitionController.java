package com.megumi.testops.project.api;

import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import com.megumi.testops.project.service.DefinitionService;

@RestController
@RequestMapping("/api/v1/projects/{projectId}")
public class DefinitionController {
    private final DefinitionService service;
    public DefinitionController(DefinitionService service) { this.service = service; }
    @GetMapping("/suites") public List<ProjectDtos.SuiteResponse> suites(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @RequestParam(defaultValue = "ACTIVE") String lifecycle) { return service.suites(jwt, projectId, lifecycle); }
    @GetMapping("/suites/{suiteId}") public ProjectDtos.SuiteResponse suite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId) { return service.getSuite(jwt, projectId, suiteId); }
    @PostMapping("/suites") @ResponseStatus(HttpStatus.CREATED) public ProjectDtos.SuiteResponse createSuite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @Valid @RequestBody ProjectDtos.SuiteRequest request) { return service.createSuite(jwt, projectId, request); }
    @PutMapping("/suites/{suiteId}") public ProjectDtos.SuiteResponse updateSuite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @Valid @RequestBody ProjectDtos.SuiteRequest request) { return service.updateSuite(jwt, projectId, suiteId, request); }
    @PostMapping("/suites/{suiteId}/archive") @ResponseStatus(HttpStatus.NO_CONTENT) public void archiveSuite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId) { service.archiveSuite(jwt, projectId, suiteId); }
    @DeleteMapping("/suites/{suiteId}") public ProjectDtos.SuiteResponse deleteSuite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @RequestHeader("If-Match") long version) { return service.archiveSuite(jwt, projectId, suiteId, version); }
    @PostMapping("/suites/{suiteId}/restore") public ProjectDtos.SuiteResponse restoreSuite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @Valid @RequestBody ProjectDtos.RestoreRequest request) { return service.restoreSuite(jwt, projectId, suiteId, request); }
    @GetMapping("/suites/{suiteId}/cases") public List<ProjectDtos.CaseResponse> cases(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @RequestParam(defaultValue = "ACTIVE") String lifecycle) { return service.cases(jwt, projectId, suiteId, lifecycle); }
    @PostMapping("/suites/{suiteId}/cases") @ResponseStatus(HttpStatus.CREATED) public ProjectDtos.CaseResponse createCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @Valid @RequestBody ProjectDtos.CaseRequest request) { return service.createCase(jwt, projectId, suiteId, request); }
    @GetMapping("/suites/{suiteId}/cases/{caseId}") public ProjectDtos.CaseResponse getCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @PathVariable UUID caseId) { return service.getCase(jwt, projectId, suiteId, caseId); }
    @PutMapping("/suites/{suiteId}/cases/{caseId}") public ProjectDtos.CaseResponse updateCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @PathVariable UUID caseId, @Valid @RequestBody ProjectDtos.CaseRequest request) { return service.updateCase(jwt, projectId, suiteId, caseId, request); }
    @DeleteMapping("/suites/{suiteId}/cases/{caseId}") public ProjectDtos.CaseResponse deleteCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @PathVariable UUID caseId, @RequestHeader("If-Match") long version) { return service.archiveCase(jwt, projectId, suiteId, caseId, version); }
    @PostMapping("/suites/{suiteId}/cases/{caseId}/restore") public ProjectDtos.CaseResponse restoreCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @PathVariable UUID caseId, @Valid @RequestBody ProjectDtos.RestoreRequest request) { return service.restoreCase(jwt, projectId, suiteId, caseId, request); }
}
