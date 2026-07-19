package com.megumi.testops.auth.service;

import org.springframework.http.ResponseCookie;

import com.megumi.testops.auth.config.AuthProperties;

public final class RefreshCookieFactory {

    private final AuthProperties.Cookie properties;

    public RefreshCookieFactory(AuthProperties.Cookie properties) {
        this.properties = properties;
    }

    public ResponseCookie create(String value) {
        return ResponseCookie.from(properties.name(), value)
                .httpOnly(true)
                .secure(properties.secure())
                .sameSite(properties.sameSite())
                .path(properties.path())
                .maxAge(properties.maxAge())
                .build();
    }

    public ResponseCookie clear() {
        return ResponseCookie.from(properties.name(), "")
                .httpOnly(true)
                .secure(properties.secure())
                .sameSite(properties.sameSite())
                .path(properties.path())
                .maxAge(0)
                .build();
    }
}
