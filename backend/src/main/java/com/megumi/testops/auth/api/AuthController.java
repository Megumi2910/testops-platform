package com.megumi.testops.auth.api;

import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.auth.service.AuthService;
import com.megumi.testops.auth.service.OriginGuard;
import com.megumi.testops.auth.service.RefreshCookieFactory;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final ObjectProvider<AuthService> authService;
    private final AuthProperties properties;
    private final OriginGuard originGuard;
    private final RefreshCookieFactory refreshCookies;

    public AuthController(ObjectProvider<AuthService> authService, AuthProperties properties,
            OriginGuard originGuard, RefreshCookieFactory refreshCookies) {
        this.authService = authService;
        this.properties = properties;
        this.originGuard = originGuard;
        this.refreshCookies = refreshCookies;
    }

    @GetMapping("/providers")
    public ProvidersResponse providers() {
        return new ProvidersResponse(properties.enabled(), properties.registrationEnabled(),
                properties.enabled() && properties.email().enabled(), properties.enabled() && properties.google().enabled());
    }

    @PostMapping("/register")
    public ResponseEntity<MessageResponse> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest servletRequest) {
        service().register(request, clientIp(servletRequest));
        return ResponseEntity.accepted().body(new MessageResponse("Check your email for a verification code"));
    }

    @PostMapping("/email/verify")
    public ResponseEntity<AuthResponse> verify(@Valid @RequestBody VerifyEmailRequest request, HttpServletRequest servletRequest) {
        AuthService.SessionResult session = service().verifyEmail(request, servletRequest.getHeader("User-Agent"), clientIp(servletRequest));
        return withRefreshCookie(session);
    }

    @PostMapping("/email/resend")
    public ResponseEntity<MessageResponse> resend(@Valid @RequestBody ResendEmailRequest request, HttpServletRequest servletRequest) {
        service().resendVerification(request.email(), clientIp(servletRequest));
        return ResponseEntity.accepted().body(new MessageResponse("If the account can be verified, a code has been sent"));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        AuthService.SessionResult session = service().login(request, servletRequest.getHeader("User-Agent"), clientIp(servletRequest));
        return withRefreshCookie(session);
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(HttpServletRequest servletRequest, HttpServletResponse servletResponse) {
        originGuard.requireSameOrigin(servletRequest);
        String raw = readRefreshCookie(servletRequest);
        try {
            AuthService.SessionResult session = service().refresh(raw, servletRequest.getHeader("User-Agent"), clientIp(servletRequest));
            return withRefreshCookie(session);
        } catch (AuthException exception) {
            servletResponse.addHeader(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString());
            throw exception;
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest servletRequest) {
        originGuard.requireSameOrigin(servletRequest);
        if (authService.getIfAvailable() != null) service().logout(readRefreshCookie(servletRequest));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }

    @GetMapping("/me")
    public UserSummaryResponse me(@AuthenticationPrincipal Jwt jwt) {
        if (jwt == null) throw new AuthException(org.springframework.http.HttpStatus.UNAUTHORIZED,
                "authentication_required", "Authentication is required");
        return service().currentUser(UUID.fromString(jwt.getSubject()));
    }

    @PostMapping("/sessions/revoke-all")
    public ResponseEntity<Void> revokeAll(@AuthenticationPrincipal Jwt jwt, HttpServletRequest servletRequest) {
        if (jwt == null) throw new AuthException(org.springframework.http.HttpStatus.UNAUTHORIZED,
                "authentication_required", "Authentication is required");
        service().revokeAllSessions(UUID.fromString(jwt.getSubject()), servletRequest.getHeader("User-Agent"), clientIp(servletRequest));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
    }

    private AuthService service() {
        AuthService service = authService.getIfAvailable();
        if (service == null) throw new AuthException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "auth_disabled", "Authentication is not enabled");
        return service;
    }

    private ResponseEntity<AuthResponse> withRefreshCookie(AuthService.SessionResult session) {
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, refreshCookies.create(session.refreshToken()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.PRAGMA, "no-cache")
                .body(session.response());
    }

    private String readRefreshCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
            if (properties.cookie().name().equals(cookie.getName())) return cookie.getValue();
        }
        return null;
    }

    private static String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr();
    }
}
