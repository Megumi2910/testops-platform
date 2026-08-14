package com.megumi.testops.shared.api;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String path;
    private final Integer stepPosition;
    public ApiException(HttpStatus status, String code, String message) { this(status, code, message, null, null); }
    public ApiException(HttpStatus status, String code, String message, String path, Integer stepPosition) {
        super(message);
        this.status = status;
        this.code = code;
        this.path = path;
        this.stepPosition = stepPosition;
    }
    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
    public String getPath() { return path; }
    public Integer getStepPosition() { return stepPosition; }
}
