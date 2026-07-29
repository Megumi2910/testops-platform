package com.megumi.testops.auth.api;

import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.megumi.testops.auth.service.AuthException;

@RestControllerAdvice
public class AuthExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AuthExceptionHandler.class);

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
        String correlationId = correlationId(request);
        log.error("Unhandled request failure correlationId={} method={} path={} exception={}", correlationId,
                request.getMethod(), request.getRequestURI(), exception.getClass().getSimpleName(), exception);
        return ResponseEntity.internalServerError().body(AuthProblem.of("internal_error", "An unexpected error occurred",
                500, request.getRequestURI(), correlationId, Map.of()));
    }

    private static String correlationId(HttpServletRequest request) {
        String value = request.getHeader("X-Correlation-Id");
        return value != null && value.matches("[A-Za-z0-9._-]{1,128}") ? value : java.util.UUID.randomUUID().toString();
    }
}
