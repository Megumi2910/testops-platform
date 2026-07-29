package com.megumi.testops.execution.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ExecutionDtos {
    private ExecutionDtos() { }
    public record ExecutionQueuedResponse(UUID executionId, String status) { }
    public record ExecutionSummaryResponse(UUID id, UUID projectId, UUID suiteId, String status, int totalCases, int completedCases,
            int passedCases, int failedCases, int errorCases, int cancelledCases, Instant createdAt, Instant startedAt, Instant finishedAt,
            String suiteNameSnapshot, String infrastructureErrorCategory) { }
    public record ExecutionResponse(UUID id, UUID projectId, UUID suiteId, String status, int totalCases, int completedCases,
            int passedCases, int failedCases, int errorCases, int cancelledCases, Instant createdAt, Instant startedAt,
            Instant finishedAt, String errorMessage, String browser, String targetOriginSnapshot, String suiteNameSnapshot,
            String infrastructureErrorCategory, List<CaseResultResponse> cases, List<ArtifactResponse> artifacts) { }
    public record CaseResultResponse(UUID id, UUID caseId, String caseName, String status, int attemptCount, Instant startedAt,
            Instant finishedAt, String errorMessage, Integer failedStepPosition, String errorCategory, List<StepResultResponse> steps) { }
    public record StepResultResponse(int position, String action, String status, Long durationMs, String errorMessage) { }
    public record ArtifactResponse(UUID id, UUID caseResultId, String type, String contentType, long byteSize, String sha256,
            boolean secretSuppressed, Instant createdAt, Instant purgedAt, String purgeReason, Integer stepPosition) { }
}
