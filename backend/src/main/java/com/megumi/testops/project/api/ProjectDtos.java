package com.megumi.testops.project.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.Set;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class ProjectDtos {
    private ProjectDtos() { }
    public record ProjectRequest(@NotBlank @Size(max = 120) String name, @Size(max = 2000) String description,
            @NotBlank @Size(max = 2048) String targetOrigin, Long projectVersion) { }
    public record ProjectResponse(UUID id, String name, String description, String targetOrigin, String status,
            long version, Instant createdAt, Instant updatedAt, String currentUserProjectRole,
            Set<String> permissions, TargetHealthResponse targetHealth, ProjectOnboardingResponse onboarding) { }
    public record ProjectOnboardingResponse(long suiteCount, long caseCount, long readyCaseCount,
            long executionCount) { }
    public record TargetHealthResponse(String status, Integer httpStatus, Instant checkedAt, String reason) { }
    public record TargetCheckResponse(UUID projectId, String status, Integer httpStatus, Instant checkedAt, String reason) { }
    public record MemberRequest(@NotBlank @Size(max = 254) String email, @NotBlank String role, Long projectVersion) { }
    public record MemberRoleRequest(@NotBlank String role, Long projectVersion) { }
    public record MemberResponse(UUID userId, String email, String displayName, String role, long version, UUID assignedBy) { }
    public record VariableRequest(@NotBlank @Pattern(regexp = "[A-Za-z][A-Za-z0-9_]{1,63}") String key,
            @NotNull Boolean secret, @Size(max = 10000) String value, Long projectVersion) { }
    public record VariableResponse(String key, boolean secret, String value, long version) { }
    public record SuiteRequest(@NotBlank @Size(max = 160) String name, @Size(max = 2000) String description, Long projectVersion) { }
    public record SuiteResponse(UUID id, UUID projectId, String name, String description, String status, long version,
            Instant archivedAt, UUID archivedBy) {
        public SuiteResponse(UUID id, UUID projectId, String name, String description, String status, long version) {
            this(id, projectId, name, description, status, version, null, null);
        }
    }
    public record RestoreRequest(@NotNull Long version, @Size(max = 200) String name) { }
    public record StepRequest(@Min(0) int position, @NotBlank String action, String locatorType, String locatorValue,
            String locatorRole, @Min(0) Integer locatorIndex, String inputValue, String expectedValue, @Min(100) @Max(120000) Integer timeoutMs,
            @Min(320) @Max(3840) Integer viewportWidth, @Min(240) @Max(2160) Integer viewportHeight, @Size(max = 80) String locale, @Size(max = 120) String timezoneId) {
        public StepRequest(int position, String action, String locatorType, String locatorValue, String locatorRole,
                String inputValue, String expectedValue, Integer timeoutMs) {
            this(position, action, locatorType, locatorValue, locatorRole, null, inputValue, expectedValue, timeoutMs, null, null, null, null);
        }
        public StepRequest(int position, String action, String locatorType, String locatorValue, String locatorRole,
                Integer locatorIndex, String inputValue, String expectedValue, Integer timeoutMs) {
            this(position, action, locatorType, locatorValue, locatorRole, locatorIndex, inputValue, expectedValue, timeoutMs, null, null, null, null);
        }
    }
    public record CaseRequest(@NotBlank @Size(max = 200) String name, @Size(max = 4000) String description,
            String status, String priority, @Size(max = 4000) String tags, @Min(0) @Max(5) Integer retryCount,
            Boolean dataIsolation, Long projectVersion, @Valid List<StepRequest> steps) { }
    public record StepResponse(UUID id, int position, String action, String locatorType, String locatorValue,
            String locatorRole, Integer locatorIndex, String inputValue, String expectedValue, Integer timeoutMs,
            Integer viewportWidth, Integer viewportHeight, String locale, String timezoneId) {
        public StepResponse(UUID id, int position, String action, String locatorType, String locatorValue,
                String locatorRole, String inputValue, String expectedValue, Integer timeoutMs) {
            this(id, position, action, locatorType, locatorValue, locatorRole, null, inputValue, expectedValue, timeoutMs, null, null, null, null);
        }
    }
    public record CaseResponse(UUID id, UUID suiteId, String name, String description, String status, String priority,
            String tags, int retryCount, boolean dataIsolation, long version, List<StepResponse> steps,
            Instant archivedAt, UUID archivedBy) {
        public CaseResponse(UUID id, UUID suiteId, String name, String description, String status, String priority,
                String tags, int retryCount, boolean dataIsolation, long version, List<StepResponse> steps) {
            this(id, suiteId, name, description, status, priority, tags, retryCount, dataIsolation, version, steps, null, null);
        }
    }
}
