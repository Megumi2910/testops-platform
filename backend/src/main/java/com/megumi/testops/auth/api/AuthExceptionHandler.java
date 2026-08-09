package com.megumi.testops.auth.api;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.shared.api.ApiExceptionHandler;
import com.megumi.testops.shared.api.ApiProblem;

@RestControllerAdvice
public class AuthExceptionHandler {

    @ExceptionHandler(AuthException.class)
    ResponseEntity<ApiProblem> auth(AuthException exception, HttpServletRequest request) {
        ApiProblem problem = ApiProblem.of(exception.getStatus().value(), "Authentication failed",
                exception.getCode(), exception.getMessage(), request.getRequestURI(),
                ApiExceptionHandler.correlationId(request), List.of());
        return ResponseEntity.status(exception.getStatus()).body(problem);
    }
}
