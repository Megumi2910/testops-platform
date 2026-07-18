package com.megumi.testops.auth.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record ResendEmailRequest(@NotBlank @Email String email) {
}
