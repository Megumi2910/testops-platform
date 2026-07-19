package com.megumi.testops.auth.api;

import java.time.Instant;
import java.util.Map;

public record AuthProblem(
        String type,
        String title,
        int status,
        String detail,
        String instance,
        Instant timestamp,
        String correlationId,
        Map<String, String> errors,
        String code,
        String message) {

    public static AuthProblem of(String code, String message, int status, String instance,
            String correlationId, Map<String, String> errors) {
        return new AuthProblem("https://testops.example/problems/" + code, message, status, message,
                instance, Instant.now(), correlationId, errors == null ? Map.of() : Map.copyOf(errors), code, message);
    }
}
