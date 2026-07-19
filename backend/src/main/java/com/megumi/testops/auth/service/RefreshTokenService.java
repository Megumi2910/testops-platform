package com.megumi.testops.auth.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import org.springframework.http.HttpStatus;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.RefreshTokenEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.RefreshTokenRepository;

import jakarta.transaction.Transactional;

public class RefreshTokenService {

    private final RefreshTokenRepository repository;
    private final AuditService audit;
    private final AuthProperties.Cookie properties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository repository, AuthProperties.Cookie properties, Clock clock,
            AuditService audit) {
        this.repository = repository;
        this.properties = properties;
        this.clock = clock;
        this.audit = audit;
    }

    @Transactional
    public IssuedRefreshToken issue(UserEntity user, String userAgent, String ip) {
        String raw = randomToken();
        Instant now = Instant.now(clock);
        RefreshTokenEntity entity = new RefreshTokenEntity(user, UUID.randomUUID(), TokenHash.sha256(raw), now,
                now.plus(properties.maxAge()), userAgent, ip);
        repository.save(entity);
        return new IssuedRefreshToken(raw, entity.getFamilyId(), entity.getExpiresAt());
    }

    @Transactional(dontRollbackOn = AuthException.class)
    public Rotation rotate(String raw, String userAgent, String ip) {
        if (raw == null || raw.isBlank()) {
            throw invalid();
        }
        RefreshTokenEntity current = repository.findByTokenHashForUpdate(TokenHash.sha256(raw))
                .orElseThrow(() -> new AuthException(HttpStatus.UNAUTHORIZED, "refresh_invalid", "Refresh session is invalid"));
        Instant now = Instant.now(clock);
        if (!current.isUsable(now)) {
            audit.record(current.getUser(), "REFRESH_REPLAY", false, ip, userAgent, null);
            revokeFamily(current.getFamilyId(), "reuse_or_expired");
            throw invalid();
        }
        current.markUsed(now);
        String replacementRaw = randomToken();
        RefreshTokenEntity replacement = new RefreshTokenEntity(current.getUser(), current.getFamilyId(),
                TokenHash.sha256(replacementRaw), now, now.plus(properties.maxAge()), userAgent, ip);
        current.replaceWith(replacement);
        repository.save(current);
        repository.save(replacement);
        return new Rotation(current.getUser(), replacementRaw, replacement.getExpiresAt());
    }

    @Transactional
    public void revoke(String raw, String reason) {
        if (raw == null || raw.isBlank()) return;
        repository.findByTokenHashForUpdate(TokenHash.sha256(raw))
                .ifPresent(token -> token.revoke(Instant.now(clock), reason));
    }

    @Transactional
    public void revokeFamily(UUID familyId, String reason) {
        repository.revokeFamily(familyId, Instant.now(clock), reason);
    }

    @Transactional
    public void revokeAll(UserEntity user, String reason) {
        repository.revokeAllForUser(user.getId(), Instant.now(clock), reason);
    }

    private String randomToken() {
        byte[] bytes = new byte[48];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static AuthException invalid() {
        return new AuthException(HttpStatus.UNAUTHORIZED, "refresh_invalid", "Refresh session is invalid");
    }

    public record IssuedRefreshToken(String value, UUID familyId, Instant expiresAt) { }
    public record Rotation(UserEntity user, String value, Instant expiresAt) { }
}
