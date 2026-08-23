package com.megumi.testops.auth.service;

import org.springframework.http.HttpStatus;

public class AuthException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final String path;

    public AuthException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public AuthException(HttpStatus status, String code, String message, String path) {
        super(message);
        this.status = status;
        this.code = code;
        this.path = path;
    }

    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
    public String getPath() { return path; }
}
