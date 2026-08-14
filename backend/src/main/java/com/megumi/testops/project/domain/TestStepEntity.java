package com.megumi.testops.project.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "test_steps")
public class TestStepEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "case_id", nullable = false) private TestCaseEntity testCase;
    @Column(nullable = false) private int position;
    @Column(nullable = false, length = 40) private String action;
    @Column(name = "locator_type", length = 40) private String locatorType;
    @Column(name = "locator_value", length = 2000) private String locatorValue;
    @Column(name = "locator_role", length = 120) private String locatorRole;
    @Column(name = "locator_index") private Integer locatorIndex;
    @Column(name = "expected_value", length = 4000) private String expectedValue;
    @Column(name = "input_value") private String inputValue;
    @Column(name = "timeout_ms") private Integer timeoutMs;
    @Column(name = "viewport_width") private Integer viewportWidth;
    @Column(name = "viewport_height") private Integer viewportHeight;
    @Column(length = 80) private String locale;
    @Column(name = "timezone_id", length = 120) private String timezoneId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    protected TestStepEntity() { }
    public TestStepEntity(TestCaseEntity testCase, int position, String action, String locatorType, String locatorValue, String locatorRole, String inputValue, String expectedValue, Integer timeoutMs, Instant now) {
        this(testCase, position, action, locatorType, locatorValue, locatorRole, null, inputValue, expectedValue, timeoutMs, now);
    }
    public TestStepEntity(TestCaseEntity testCase, int position, String action, String locatorType, String locatorValue, String locatorRole, Integer locatorIndex, String inputValue, String expectedValue, Integer timeoutMs, Instant now) {
        this(testCase, position, action, locatorType, locatorValue, locatorRole, locatorIndex, inputValue, expectedValue, timeoutMs, null, null, null, null, now);
    }
    public TestStepEntity(TestCaseEntity testCase, int position, String action, String locatorType, String locatorValue, String locatorRole, Integer locatorIndex, String inputValue, String expectedValue, Integer timeoutMs, Integer viewportWidth, Integer viewportHeight, String locale, String timezoneId, Instant now) {
        this.id = UUID.randomUUID(); this.testCase = testCase; this.position = position; this.action = action; this.locatorType = locatorType; this.locatorValue = locatorValue; this.locatorRole = locatorRole; this.locatorIndex = locatorIndex; this.inputValue = inputValue; this.expectedValue = expectedValue; this.timeoutMs = timeoutMs; this.viewportWidth = viewportWidth; this.viewportHeight = viewportHeight; this.locale = locale; this.timezoneId = timezoneId; this.createdAt = now;
    }
    public UUID getId() { return id; } public int getPosition() { return position; } public String getAction() { return action; } public String getLocatorType() { return locatorType; } public String getLocatorValue() { return locatorValue; } public String getLocatorRole() { return locatorRole; } public Integer getLocatorIndex() { return locatorIndex; } public String getInputValue() { return inputValue; } public String getExpectedValue() { return expectedValue; } public Integer getTimeoutMs() { return timeoutMs; } public Integer getViewportWidth() { return viewportWidth; } public Integer getViewportHeight() { return viewportHeight; } public String getLocale() { return locale; } public String getTimezoneId() { return timezoneId; }
}
