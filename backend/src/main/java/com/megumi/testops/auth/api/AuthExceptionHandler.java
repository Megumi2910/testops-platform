package com.megumi.testops.auth.api;

import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.megumi.testops.auth.service.AuthException;

@RestControllerAdvice
public class AuthExceptionHandler {

    @ExceptionHandler(AuthException.class)
    ResponseEntity<AuthProblem> auth(AuthException exception, HttpServletRequest request) {
        String correlationId = correlationId(request);
        return ResponseEntity.status(exception.getStatus()).body(AuthProblem.of(exception.getCode(), exception.getMessage(),
                exception.getStatus().value(), request.getRequestURI(), correlationId, Map.of()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<AuthProblem> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(),
                error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage()));
        return ResponseEntity.badRequest().body(AuthProblem.of("validation_failed", "One or more fields are invalid", 400,
                request.getRequestURI(), correlationId(request), errors));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<AuthProblem> unexpected(Exception exception, HttpServletRequest request) {
        return ResponseEntity.internalServerError().body(AuthProblem.of("internal_error", "An unexpected error occurred",
                500, request.getRequestURI(), correlationId(request), Map.of()));
    }

    private static String correlationId(HttpServletRequest request) {
        String value = request.getHeader("X-Correlation-Id");
        return value != null && value.matches("[A-Za-z0-9._-]{1,128}") ? value : java.util.UUID.randomUUID().toString();
    }
}
