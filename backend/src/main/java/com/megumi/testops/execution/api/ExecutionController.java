package com.megumi.testops.execution.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import com.megumi.testops.execution.service.ExecutionService;

@RestController
@RequestMapping("/api/v1/projects/{projectId}")
public class ExecutionController {
    private final ExecutionService service;
    public ExecutionController(ExecutionService service) { this.service = service; }

    @PostMapping("/suites/{suiteId}/executions")
    public ResponseEntity<ExecutionDtos.ExecutionQueuedResponse> queueSuite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID id = parseKey(key); var execution = service.queueSuite(jwt, projectId, suiteId, id); return ResponseEntity.accepted().location(URI.create("/api/v1/projects/" + projectId + "/executions/" + execution.getId())).body(new ExecutionDtos.ExecutionQueuedResponse(execution.getId(), execution.getStatus().name()));
    }
    @PostMapping("/suites/{suiteId}/cases/{caseId}/executions")
    public ResponseEntity<ExecutionDtos.ExecutionQueuedResponse> queueCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID suiteId, @PathVariable UUID caseId, @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID id = parseKey(key); var execution = service.queueCase(jwt, projectId, suiteId, caseId, id); return ResponseEntity.accepted().location(URI.create("/api/v1/projects/" + projectId + "/executions/" + execution.getId())).body(new ExecutionDtos.ExecutionQueuedResponse(execution.getId(), execution.getStatus().name()));
    }
    @GetMapping("/executions") public List<ExecutionDtos.ExecutionSummaryResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) { return service.list(jwt, projectId); }
    @GetMapping("/executions/{executionId}") public ExecutionDtos.ExecutionResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID executionId) { return service.get(jwt, projectId, executionId); }
    @GetMapping("/executions/{executionId}/results") public List<ExecutionDtos.CaseResultResponse> results(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID executionId) { return service.results(jwt, projectId, executionId); }
    @PostMapping("/executions/{executionId}/cancel") public ResponseEntity<Void> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID executionId) { var execution = service.cancel(jwt, projectId, executionId); return ResponseEntity.accepted().location(URI.create("/api/v1/projects/" + projectId + "/executions/" + execution.getId())).build(); }
    @GetMapping("/executions/{executionId}/artifacts/{artifactId}") public ResponseEntity<FileSystemResource> artifact(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId, @PathVariable UUID executionId, @PathVariable UUID artifactId) { var download = service.artifactDownload(jwt, projectId, executionId, artifactId); MediaType contentType; try { contentType = MediaType.parseMediaType(download.contentType()); } catch (IllegalArgumentException ex) { contentType = MediaType.APPLICATION_OCTET_STREAM; } var disposition = "SCREENSHOT".equals(download.type()) ? "inline" : "attachment"; return ResponseEntity.ok().header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, disposition + "; filename=\"" + download.path().getFileName() + "\"").contentType(contentType).body(new FileSystemResource(download.path())); }
    private static UUID parseKey(String value) { try { return value == null ? null : UUID.fromString(value); } catch (IllegalArgumentException ex) { return null; } }
}
