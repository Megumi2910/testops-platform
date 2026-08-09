package com.megumi.testops.shared.api;

import java.util.List;

public record ApiProblem(
        String type,
        String title,
        int status,
        String code,
        String detail,
        String instance,
        String correlationId,
        List<Violation> errors) {

    public static ApiProblem of(int status, String title, String code, String detail,
            String instance, String correlationId, List<Violation> errors) {
        return new ApiProblem("https://testops.example/problems/" + code, title, status, code,
                detail, instance, correlationId, errors == null ? List.of() : List.copyOf(errors));
    }

    public record Violation(String path, String code, String message, Integer stepPosition) { }
}
