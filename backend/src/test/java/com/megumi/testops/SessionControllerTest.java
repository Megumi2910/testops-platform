package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.api.SessionController;
import com.megumi.testops.auth.domain.RefreshTokenEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.RefreshTokenRepository;
import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.auth.service.RefreshTokenService;

class SessionControllerTest {
    private final RefreshTokenRepository tokens = mock(RefreshTokenRepository.class);
    private final RefreshTokenService refreshTokens = mock(RefreshTokenService.class);
    private final SessionController controller = new SessionController(tokens, refreshTokens);

    @Test
    void listsAndRevokesOnlyActiveSessionsOwnedBySubject() {
        Instant now = Instant.now();
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        UUID family = UUID.randomUUID();
        RefreshTokenEntity token = new RefreshTokenEntity(user, family, "hash", now, now.plusSeconds(600), "browser", "127.0.0.1");
        Jwt jwt = Jwt.withTokenValue("test-token").header("alg", "none").subject(user.getId().toString()).build();
        when(tokens.findByUserIdAndRevokedAtIsNullAndExpiresAtAfterOrderByIssuedAtDesc(eq(user.getId()), any(Instant.class)))
                .thenReturn(List.of(token));

        List<SessionController.SessionResponse> sessions = controller.list(jwt);
        controller.revoke(jwt, family);

        assertEquals(1, sessions.size());
        assertEquals(family, sessions.getFirst().familyId());
        verify(refreshTokens).revokeFamily(family, "USER_REVOKED_SESSION");
    }

    @Test
    void rejectsRevocationOfAnotherFamily() {
        Instant now = Instant.now();
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        UUID ownedFamily = UUID.randomUUID();
        UUID foreignFamily = UUID.randomUUID();
        RefreshTokenEntity token = new RefreshTokenEntity(user, ownedFamily, "hash", now, now.plusSeconds(600), "browser", null);
        Jwt jwt = Jwt.withTokenValue("test-token").header("alg", "none").subject(user.getId().toString()).build();
        when(tokens.findByUserIdAndRevokedAtIsNullAndExpiresAtAfterOrderByIssuedAtDesc(eq(user.getId()), any(Instant.class)))
                .thenReturn(List.of(token));

        AuthException error = assertThrows(AuthException.class, () -> controller.revoke(jwt, foreignFamily));

        assertEquals("session_not_found", error.getCode());
        verify(refreshTokens, never()).revokeFamily(foreignFamily, "USER_REVOKED_SESSION");
    }
}
