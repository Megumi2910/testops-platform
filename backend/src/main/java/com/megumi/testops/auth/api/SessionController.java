package com.megumi.testops.auth.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;

import com.megumi.testops.auth.domain.RefreshTokenEntity;
import com.megumi.testops.auth.repository.RefreshTokenRepository;
import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.auth.service.RefreshTokenService;

@RestController
@ConditionalOnBean(RefreshTokenService.class)
@RequestMapping("/api/v1/users/me/sessions")
public class SessionController {
    private final RefreshTokenRepository tokens;
    private final RefreshTokenService refreshTokens;
    public SessionController(RefreshTokenRepository tokens, RefreshTokenService refreshTokens) { this.tokens = tokens; this.refreshTokens = refreshTokens; }

    @GetMapping
    public List<SessionResponse> list(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = subject(jwt);
        return tokens.findByUserIdAndRevokedAtIsNullAndExpiresAtAfterOrderByIssuedAtDesc(userId, Instant.now()).stream().map(t -> new SessionResponse(t.getFamilyId(), t.getIssuedAt(), t.getExpiresAt(), t.getUserAgent(), t.getCreatedIp())).toList();
    }

    @DeleteMapping("/{familyId}")
    public void revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID familyId) {
        UUID userId = subject(jwt);
        boolean owned = tokens.findByUserIdAndRevokedAtIsNullAndExpiresAtAfterOrderByIssuedAtDesc(userId, Instant.now()).stream().anyMatch(token -> token.getFamilyId().equals(familyId));
        if (!owned) throw new AuthException(HttpStatus.NOT_FOUND, "session_not_found", "Session was not found");
        refreshTokens.revokeFamily(familyId, "USER_REVOKED_SESSION");
    }

    private static UUID subject(Jwt jwt) { if (jwt == null || jwt.getSubject() == null) throw new AuthException(HttpStatus.UNAUTHORIZED, "authentication_required", "Authentication is required"); try { return UUID.fromString(jwt.getSubject()); } catch (IllegalArgumentException ex) { throw new AuthException(HttpStatus.UNAUTHORIZED, "invalid_subject", "Authentication subject is invalid"); } }
    public record SessionResponse(UUID familyId, Instant issuedAt, Instant expiresAt, String userAgent, String createdIp) { }
}
