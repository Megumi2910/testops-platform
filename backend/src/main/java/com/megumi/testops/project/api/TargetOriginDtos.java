package com.megumi.testops.project.api;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class TargetOriginDtos {
    private TargetOriginDtos() { }

    public record CreateRequest(@NotBlank @Size(max = 2048) String origin) { }
    public record UpdateRequest(@NotNull Boolean enabled, @NotNull @Min(0) Long version) { }
    public record Response(UUID id, String origin, String source, boolean enabled, boolean usable, String blockedReason,
            long usageCount, Long version, Instant createdAt, Instant updatedAt) { }
}
