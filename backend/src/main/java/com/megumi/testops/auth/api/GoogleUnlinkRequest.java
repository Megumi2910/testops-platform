package com.megumi.testops.auth.api;

import jakarta.validation.constraints.NotBlank;

public record GoogleUnlinkRequest(@NotBlank String currentPassword) { }
