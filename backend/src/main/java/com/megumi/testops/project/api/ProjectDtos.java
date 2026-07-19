package com.megumi.testops.project.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

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
            long version, Instant createdAt, Instant updatedAt) { }
    public record MemberRequest(@NotBlank @Size(max = 254) String email, @NotBlank String role, Long projectVersion) { }
    public record MemberRoleRequest(@NotBlank String role, Long projectVersion) { }
    public record MemberResponse(UUID userId, String email, String displayName, String role, long version) { }
    public record VariableRequest(@NotBlank @Pattern(regexp = "[A-Za-z][A-Za-z0-9_]{1,63}") String key,
            @NotNull Boolean secret, @Size(max = 10000) String value, Long projectVersion) { }
    public record VariableResponse(String key, boolean secret, String value, long version) { }
    public record SuiteRequest(@NotBlank @Size(max = 160) String name, @Size(max = 2000) String description, Long projectVersion) { }
    public record SuiteResponse(UUID id, UUID projectId, String name, String description, String status, long version) { }
    public record StepRequest(@Min(0) int position, @NotBlank String action, String locatorType, String locatorValue,
            String inputValue, @Min(100) @Max(120000) Integer timeoutMs) { }
    public record CaseRequest(@NotBlank @Size(max = 200) String name, @Size(max = 4000) String description,
            String status, String priority, @Size(max = 4000) String tags, @Min(0) @Max(5) Integer retryCount,
            Boolean dataIsolation, Long projectVersion, @Valid List<StepRequest> steps) { }
    public record StepResponse(UUID id, int position, String action, String locatorType, String locatorValue,
            String inputValue, Integer timeoutMs) { }
    public record CaseResponse(UUID id, UUID suiteId, String name, String description, String status, String priority,
            String tags, int retryCount, boolean dataIsolation, long version, List<StepResponse> steps) { }
}
