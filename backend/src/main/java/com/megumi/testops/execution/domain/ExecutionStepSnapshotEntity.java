package com.megumi.testops.execution.domain;

import java.util.UUID;

import com.megumi.testops.project.domain.TestStepEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "execution_step_snapshots")
public class ExecutionStepSnapshotEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "case_result_id", nullable = false) private TestCaseResultEntity caseResult;
    @Column(nullable = false) private int position;
    @Column(nullable = false, length = 40) private String action;
    @Column(name = "locator_type", length = 40) private String locatorType;
    @Column(name = "locator_value", length = 2000) private String locatorValue;
    @Column(name = "locator_role", length = 120) private String locatorRole;
    @Column(name = "input_value") private String inputValue;
    @Column(name = "expected_value", length = 4000) private String expectedValue;
    @Column(name = "timeout_ms") private Integer timeoutMs;

    protected ExecutionStepSnapshotEntity() { }

    private ExecutionStepSnapshotEntity(TestCaseResultEntity caseResult, TestStepEntity step) {
        this.id = UUID.randomUUID();
        this.caseResult = caseResult;
        this.position = step.getPosition();
        this.action = step.getAction();
        this.locatorType = step.getLocatorType();
        this.locatorValue = step.getLocatorValue();
        this.locatorRole = step.getLocatorRole();
        this.inputValue = step.getInputValue();
        this.expectedValue = step.getExpectedValue();
        this.timeoutMs = step.getTimeoutMs();
    }

    public static ExecutionStepSnapshotEntity from(TestCaseResultEntity caseResult, TestStepEntity step) {
        return new ExecutionStepSnapshotEntity(caseResult, step);
    }

    public UUID getId() { return id; }
    public TestCaseResultEntity getCaseResult() { return caseResult; }
    public int getPosition() { return position; }
    public String getAction() { return action; }
    public String getLocatorType() { return locatorType; }
    public String getLocatorValue() { return locatorValue; }
    public String getLocatorRole() { return locatorRole; }
    public String getInputValue() { return inputValue; }
    public String getExpectedValue() { return expectedValue; }
    public Integer getTimeoutMs() { return timeoutMs; }
}
