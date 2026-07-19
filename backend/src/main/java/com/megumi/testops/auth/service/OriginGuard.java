package com.megumi.testops.auth.service;

import java.net.URI;

import org.springframework.http.HttpStatus;

import com.megumi.testops.auth.config.AuthProperties;

import jakarta.servlet.http.HttpServletRequest;

public final class OriginGuard {

    private final String expectedOrigin;

    public OriginGuard(AuthProperties properties) {
        this.expectedOrigin = originOf(URI.create(properties.frontendOrigin()));
    }

    public void requireSameOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null && !expectedOrigin.equals(normalize(origin))) {
            throw invalidOrigin();
        }
        String referer = request.getHeader("Referer");
        if (origin == null && referer != null && !expectedOrigin.equals(originOf(parse(referer)))) {
            throw invalidOrigin();
        }
    }

    private String normalize(String value) {
        return originOf(parse(value));
    }

    private static URI parse(String value) {
        try {
            return URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw invalidOrigin();
        }
    }

    private static String originOf(URI uri) {
        if (!uri.isAbsolute() || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null) throw invalidOrigin();
        return uri.getScheme().toLowerCase(java.util.Locale.ROOT) + "://"
                + uri.getRawAuthority().toLowerCase(java.util.Locale.ROOT);
    }

    private static AuthException invalidOrigin() {
        return new AuthException(HttpStatus.FORBIDDEN, "origin_invalid", "Request origin is not allowed");
    }
}
