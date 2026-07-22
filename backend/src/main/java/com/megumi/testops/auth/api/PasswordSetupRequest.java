package com.megumi.testops.auth.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordSetupRequest(@NotBlank String otp, @NotBlank @Size(min = 12, max = 128) String password) { }
