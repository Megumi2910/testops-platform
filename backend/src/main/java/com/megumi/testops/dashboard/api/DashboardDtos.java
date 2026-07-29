package com.megumi.testops.dashboard.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class DashboardDtos {
    private DashboardDtos() { }
    public record Summary(long totalExecutions, long passedCases, long failedCases, long infrastructureErrors,
            double functionalPassRate, double infrastructureErrorRate, Instant from, Instant to) { }
    public record Trend(LocalDate day, long passed, long failed, long errors) { }
    public record RecentFailure(UUID executionId, UUID projectId, UUID caseId, String caseName, String category,
            String message, Instant finishedAt) { }
    public record InfrastructureError(String category, long count) { }
}
