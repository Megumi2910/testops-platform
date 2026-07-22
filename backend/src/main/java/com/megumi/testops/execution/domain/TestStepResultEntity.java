package com.megumi.testops.execution.domain;

import java.util.UUID;
import jakarta.persistence.*;

@Entity @Table(name = "test_step_results")
public class TestStepResultEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "case_result_id", nullable = false) private TestCaseResultEntity caseResult;
    @Column(nullable = false) private int position;
    @Column(nullable = false, length = 40) private String action;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "duration_ms") private Long durationMs;
    @Column(name = "error_message", length = 4000) private String errorMessage;
    protected TestStepResultEntity() { }
    public TestStepResultEntity(TestCaseResultEntity caseResult, int position, String action, String status, Long durationMs, String errorMessage) { this.id = UUID.randomUUID(); this.caseResult = caseResult; this.position = position; this.action = action; this.status = status; this.durationMs = durationMs; this.errorMessage = errorMessage; }
    public UUID getId() { return id; } public int getPosition() { return position; } public String getAction() { return action; } public String getStatus() { return status; } public Long getDurationMs() { return durationMs; } public String getErrorMessage() { return errorMessage; }
}
