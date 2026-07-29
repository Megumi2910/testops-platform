package com.megumi.testops.execution.domain;

import java.time.Instant;
import java.util.UUID;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "test_executions")
public class ExecutionEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id", nullable = false) private ProjectEntity project;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "suite_id") private TestSuiteEntity suite;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "requested_by", nullable = false) private UserEntity requestedBy;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private ExecutionStatus status;
    @Column(name = "total_cases", nullable = false) private int totalCases;
    @Column(name = "completed_cases", nullable = false) private int completedCases;
    @Column(name = "passed_cases", nullable = false) private int passedCases;
    @Column(name = "failed_cases", nullable = false) private int failedCases;
    @Column(name = "error_cases", nullable = false) private int errorCases;
    @Column(name = "cancelled_cases", nullable = false) private int cancelledCases;
    @Column(name = "idempotency_key", nullable = false) private UUID idempotencyKey;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "finished_at") private Instant finishedAt;
    @Column(name = "heartbeat_at") private Instant heartbeatAt;
    @Column(name = "cancel_requested_at") private Instant cancelRequestedAt;
    @Column(name = "error_message", length = 4000) private String errorMessage;
    @Column(length = 40) private String browser;
    @Column(name = "target_origin_snapshot", length = 500) private String targetOriginSnapshot;
    @Column(name = "suite_name_snapshot", length = 200) private String suiteNameSnapshot;
    @Column(name = "infrastructure_error_category", length = 40) private String infrastructureErrorCategory;
    @Version @Column(nullable = false) private long version;

    protected ExecutionEntity() { }
    public ExecutionEntity(ProjectEntity project, TestSuiteEntity suite, UserEntity requestedBy, int totalCases, UUID idempotencyKey, Instant now) {
        this.id = UUID.randomUUID(); this.project = project; this.suite = suite; this.requestedBy = requestedBy; this.status = ExecutionStatus.QUEUED;
        this.totalCases = totalCases; this.idempotencyKey = idempotencyKey; this.createdAt = now; this.heartbeatAt = now;
        this.browser = "chromium"; this.targetOriginSnapshot = project.getTargetOrigin(); this.suiteNameSnapshot = suite == null ? null : suite.getName();
    }
    public void start(Instant now) { status = ExecutionStatus.RUNNING; startedAt = now; heartbeatAt = now; }
    public void heartbeat(Instant now) { heartbeatAt = now; }
    public void requestCancel(Instant now) { cancelRequestedAt = now; }
    public boolean cancelRequested() { return cancelRequestedAt != null; }
    public void record(ExecutionStatus result) { completedCases++; switch (result) { case PASSED -> passedCases++; case FAILED -> failedCases++; case ERROR -> errorCases++; case CANCELLED -> cancelledCases++; default -> { } } }
    public void finish(ExecutionStatus result, Instant now, String error) { status = result; finishedAt = now; heartbeatAt = now; errorMessage = error; }
    public UUID getId() { return id; } public ProjectEntity getProject() { return project; } public TestSuiteEntity getSuite() { return suite; } public UserEntity getRequestedBy() { return requestedBy; }
    public ExecutionStatus getStatus() { return status; } public int getTotalCases() { return totalCases; } public int getCompletedCases() { return completedCases; }
    public int getPassedCases() { return passedCases; } public int getFailedCases() { return failedCases; } public int getErrorCases() { return errorCases; } public int getCancelledCases() { return cancelledCases; }
    public UUID getIdempotencyKey() { return idempotencyKey; } public Instant getCreatedAt() { return createdAt; } public Instant getStartedAt() { return startedAt; } public Instant getFinishedAt() { return finishedAt; } public Instant getHeartbeatAt() { return heartbeatAt; } public String getErrorMessage() { return errorMessage; }
    public String getBrowser() { return browser; } public String getTargetOriginSnapshot() { return targetOriginSnapshot; } public String getSuiteNameSnapshot() { return suiteNameSnapshot; } public String getInfrastructureErrorCategory() { return infrastructureErrorCategory; }
    public void setInfrastructureErrorCategory(String category) { this.infrastructureErrorCategory = category; }
}
