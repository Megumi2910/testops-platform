package com.megumi.testops.shared.api;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final Pattern STEP_PATH = Pattern.compile("steps\\[(\\d+)]");

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiProblem> api(ApiException exception, HttpServletRequest request) {
        List<ApiProblem.Violation> errors = exception.getPath() == null ? List.of()
                : List.of(new ApiProblem.Violation(exception.getPath(), exception.getCode(),
                        exception.getMessage(), exception.getStepPosition()));
        return response(exception.getStatus(), exception.getCode(), exception.getMessage(), errors, request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiProblem> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<ApiProblem.Violation> errors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiProblem.Violation(error.getField(), validationCode(error.getCode()),
                        error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage(),
                        stepPosition(error.getField())))
                .toList();
        return response(HttpStatus.BAD_REQUEST, "validation_failed", "One or more fields are invalid", errors, request);
    }

    @ExceptionHandler(ServletRequestBindingException.class)
    ResponseEntity<ApiProblem> binding(ServletRequestBindingException exception, HttpServletRequest request) {
        String path = exception instanceof MissingRequestHeaderException missing ? missing.getHeaderName() : "request";
        List<ApiProblem.Violation> errors = List.of(new ApiProblem.Violation(path, "request_binding_failed",
                exception.getMessage(), null));
        return response(HttpStatus.BAD_REQUEST, "request_binding_failed", "A required request value is missing", errors,
                request);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiProblem> typeMismatch(MethodArgumentTypeMismatchException exception, HttpServletRequest request) {
        List<ApiProblem.Violation> errors = List.of(new ApiProblem.Violation(exception.getName(), "type_mismatch",
                "The supplied value has the wrong type", null));
        return response(HttpStatus.BAD_REQUEST, "type_mismatch", "A request value has the wrong type", errors, request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiProblem> unexpected(Exception exception, HttpServletRequest request) {
        String correlationId = correlationId(request);
        log.error("Unhandled request failure correlationId={} method={} path={} exception={}", correlationId,
                request.getMethod(), request.getRequestURI(), exception.getClass().getSimpleName(), exception);
        ApiProblem body = ApiProblem.of(500, "Internal server error", "internal_error",
                "An unexpected error occurred", request.getRequestURI(), correlationId, List.of());
        return ResponseEntity.internalServerError().body(body);
    }

    public static String correlationId(HttpServletRequest request) {
        String value = request.getHeader("X-Correlation-Id");
        return value != null && value.matches("[A-Za-z0-9._-]{1,128}") ? value : UUID.randomUUID().toString();
    }

    private static ResponseEntity<ApiProblem> response(HttpStatus status, String code, String detail,
            List<ApiProblem.Violation> errors, HttpServletRequest request) {
        return ResponseEntity.status(status).body(ApiProblem.of(status.value(), title(status), code, detail,
                request.getRequestURI(), correlationId(request), errors));
    }

    private static String title(HttpStatus status) {
        return switch (status) {
            case BAD_REQUEST -> "Validation failed";
            case UNAUTHORIZED -> "Authentication failed";
            case FORBIDDEN -> "Forbidden";
            case NOT_FOUND -> "Not found";
            case CONFLICT -> "Conflict";
            default -> status.getReasonPhrase();
        };
    }

    private static String validationCode(String code) {
        return code == null ? "invalid" : code.replaceAll("([a-z])([A-Z])", "$1_$2").toLowerCase();
    }

    private static Integer stepPosition(String path) {
        Matcher matcher = STEP_PATH.matcher(path);
        return matcher.find() ? Integer.valueOf(matcher.group(1)) : null;
    }
}
