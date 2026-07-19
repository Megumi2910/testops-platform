package com.megumi.testops.shared.api;

import java.net.URI;
import java.time.Instant;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> handle(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(Map.of(
                "type", URI.create("urn:testops:" + ex.getCode()),
                "title", ex.getCode(), "status", ex.getStatus().value(), "detail", ex.getMessage(), "timestamp", Instant.now()));
    }
}
