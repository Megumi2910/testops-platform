package com.megumi.testops.execution.domain;

import java.time.Instant;
import java.util.UUID;
import com.megumi.testops.project.domain.TestCaseEntity;
import jakarta.persistence.*;

@Entity @Table(name = "test_case_results")
public class TestCaseResultEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "execution_id", nullable = false) private ExecutionEntity execution;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "case_id", nullable = false) private TestCaseEntity testCase;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private ExecutionStatus status;
    @Column(name = "attempt_count", nullable = false) private int attemptCount;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "finished_at") private Instant finishedAt;
    @Column(name = "error_message", length = 4000) private String errorMessage;
    protected TestCaseResultEntity() { }
    public TestCaseResultEntity(ExecutionEntity execution, TestCaseEntity testCase) { this.id = UUID.randomUUID(); this.execution = execution; this.testCase = testCase; this.status = ExecutionStatus.QUEUED; }
    public void start(Instant now) { status = ExecutionStatus.RUNNING; startedAt = now; attemptCount++; }
    public void finish(ExecutionStatus result, Instant now, String error) { status = result; finishedAt = now; errorMessage = error; }
    public UUID getId() { return id; } public ExecutionEntity getExecution() { return execution; } public TestCaseEntity getTestCase() { return testCase; } public ExecutionStatus getStatus() { return status; } public int getAttemptCount() { return attemptCount; } public Instant getStartedAt() { return startedAt; } public Instant getFinishedAt() { return finishedAt; } public String getErrorMessage() { return errorMessage; }
}
