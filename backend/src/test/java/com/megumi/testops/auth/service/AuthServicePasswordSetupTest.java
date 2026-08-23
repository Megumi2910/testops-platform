package com.megumi.testops.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.EmailVerificationChallengeEntity;
import com.megumi.testops.auth.domain.LocalCredentialEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.EmailVerificationChallengeRepository;
import com.megumi.testops.auth.repository.LocalCredentialRepository;
import com.megumi.testops.auth.repository.OAuthAccountRepository;
import com.megumi.testops.auth.repository.UserRepository;

class AuthServicePasswordSetupTest {
    private static final Instant NOW = Instant.parse("2026-08-23T12:00:00Z");
    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private final UserRepository users = mock(UserRepository.class);
    private final LocalCredentialRepository credentials = mock(LocalCredentialRepository.class);
    private final EmailVerificationChallengeRepository challenges = mock(EmailVerificationChallengeRepository.class);
    private final OAuthAccountRepository oauthAccounts = mock(OAuthAccountRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final OtpHasher otpHasher = mock(OtpHasher.class);
    private final EmailDeliveryService emailDelivery = mock(EmailDeliveryService.class);
    private final RefreshTokenService refreshTokens = mock(RefreshTokenService.class);
    private final AuthProperties properties = properties();
    private final UserEntity user = mock(UserEntity.class);
    private final AuthService service = new AuthService(users, credentials, challenges, oauthAccounts,
            passwordEncoder, otpHasher, emailDelivery, mock(JwtTokenService.class), refreshTokens,
            mock(AuditService.class), new AuthRateLimiter(properties.limits()), properties,
            Clock.fixed(NOW, ZoneOffset.UTC), mock(PlatformPermissionService.class));

    @BeforeEach
    void setUp() {
        when(user.getId()).thenReturn(USER_ID);
        when(user.getEmail()).thenReturn("qa@example.com");
        when(user.getDisplayName()).thenReturn("QA User");
        when(users.findByIdForUpdate(USER_ID)).thenReturn(Optional.of(user));
        when(credentials.existsByUserId(USER_ID)).thenReturn(false);
    }

    @Test
    void beginPasswordSetupReusesActiveChallengeCooldown() {
        EmailVerificationChallengeEntity active = mock(EmailVerificationChallengeEntity.class);
        when(active.getResendAvailableAt()).thenReturn(NOW.plusMillis(17_500));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                USER_ID, "ADD_PASSWORD")).thenReturn(Optional.of(active));

        AuthService.ResendVerificationResult result = service.beginPasswordSetup(USER_ID, "192.0.2.20");

        assertEquals(NOW.plusMillis(17_500), result.nextResendAt());
        assertEquals(18, result.retryAfterSeconds());
        verify(users).findByIdForUpdate(USER_ID);
        verify(challenges, never()).countByUserIdAndPurposeAndIssuedAtAfter(any(), anyString(), any());
        verify(challenges, never()).save(any());
        verify(challenges, never()).flush();
        verify(active, never()).invalidate(any(), anyString());
        verify(emailDelivery, never()).sendVerificationCode(anyString(), anyString(), anyString(), any());
    }

    @Test
    void beginPasswordSetupInvalidatesAndFlushesPreviousChallengeBeforeSending() {
        EmailVerificationChallengeEntity previous = mock(EmailVerificationChallengeEntity.class);
        when(previous.getResendAvailableAt()).thenReturn(NOW.minusSeconds(1));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                USER_ID, "ADD_PASSWORD")).thenReturn(Optional.of(previous));
        when(challenges.countByUserIdAndPurposeAndIssuedAtAfter(USER_ID, "ADD_PASSWORD", NOW.minus(Duration.ofHours(1))))
                .thenReturn(1L);
        when(otpHasher.hash(eq("qa@example.com"), anyString())).thenReturn("otp-hash");

        AuthService.ResendVerificationResult result = service.beginPasswordSetup(USER_ID, "192.0.2.21");

        assertEquals(NOW.plusSeconds(30), result.nextResendAt());
        assertEquals(30, result.retryAfterSeconds());
        InOrder order = inOrder(previous, challenges, emailDelivery);
        order.verify(previous).invalidate(NOW, "RESENT_ADD_PASSWORD");
        order.verify(challenges).flush();
        order.verify(challenges).save(any(EmailVerificationChallengeEntity.class));
        order.verify(emailDelivery).sendVerificationCode(eq("qa@example.com"), eq("QA User"), anyString(),
                eq(NOW.plus(Duration.ofMinutes(10))));
    }

    @Test
    void beginPasswordSetupRejectsHourlySendLimitWithoutReplacingChallenge() {
        EmailVerificationChallengeEntity previous = mock(EmailVerificationChallengeEntity.class);
        when(previous.getResendAvailableAt()).thenReturn(NOW.minusSeconds(1));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                USER_ID, "ADD_PASSWORD")).thenReturn(Optional.of(previous));
        when(challenges.countByUserIdAndPurposeAndIssuedAtAfter(USER_ID, "ADD_PASSWORD", NOW.minus(Duration.ofHours(1))))
                .thenReturn(3L);

        AuthException error = assertThrows(AuthException.class,
                () -> service.beginPasswordSetup(USER_ID, "192.0.2.22"));

        assertEquals(HttpStatus.TOO_MANY_REQUESTS, error.getStatus());
        assertEquals("verification_rate_limited", error.getCode());
        verify(previous, never()).invalidate(any(), anyString());
        verify(challenges, never()).flush();
        verify(challenges, never()).save(any());
        verify(emailDelivery, never()).sendVerificationCode(anyString(), anyString(), anyString(), any());
    }

    @Test
    void unavailableAndInvalidAddPasswordCodesTargetOtpField() {
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                USER_ID, "ADD_PASSWORD")).thenReturn(Optional.empty());

        AuthException unavailable = assertThrows(AuthException.class,
                () -> service.confirmPasswordSetup(USER_ID, "123456", "correct-horse-battery-staple"));

        assertEquals("verification_unavailable", unavailable.getCode());
        assertEquals("otp", unavailable.getPath());

        EmailVerificationChallengeEntity challenge = mock(EmailVerificationChallengeEntity.class);
        when(challenge.isActive(NOW)).thenReturn(true);
        when(challenge.getOtpHash()).thenReturn("otp-hash");
        when(challenge.getFailedAttempts()).thenReturn(1);
        when(challenge.getMaxAttempts()).thenReturn(5);
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                USER_ID, "ADD_PASSWORD")).thenReturn(Optional.of(challenge));
        when(otpHasher.matches("qa@example.com", "654321", "otp-hash")).thenReturn(false);

        AuthException invalid = assertThrows(AuthException.class,
                () -> service.confirmPasswordSetup(USER_ID, "654321", "correct-horse-battery-staple"));

        assertEquals("verification_invalid", invalid.getCode());
        assertEquals("otp", invalid.getPath());
        verify(users, times(2)).findByIdForUpdate(USER_ID);
        verify(challenge).failAttempt();
        verify(challenge, never()).invalidate(any(), anyString());
    }

    @Test
    void fifthInvalidAddPasswordAttemptIsPersistableAndInvalidatesChallenge() {
        EmailVerificationChallengeEntity challenge = spy(new EmailVerificationChallengeEntity(
                user, "ADD_PASSWORD", "otp-hash", NOW.minusSeconds(1), NOW.plusSeconds(600),
                NOW.plusSeconds(30), "192.0.2.23"));
        for (int attempt = 0; attempt < 4; attempt++) challenge.failAttempt();
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                USER_ID, "ADD_PASSWORD")).thenReturn(Optional.of(challenge));
        when(otpHasher.matches("qa@example.com", "999999", "otp-hash")).thenReturn(false);

        AuthException error = assertThrows(AuthException.class,
                () -> service.confirmPasswordSetup(USER_ID, "999999", "correct-horse-battery-staple"));

        assertEquals("verification_invalid", error.getCode());
        assertEquals(5, challenge.getFailedAttempts());
        assertFalse(challenge.isActive(NOW));
        verify(users).findByIdForUpdate(USER_ID);
        verify(challenge).invalidate(NOW, "MAX_ATTEMPTS");
    }

    @Test
    void wrongChangeAndUnlinkPasswordsTargetCurrentPasswordField() {
        LocalCredentialEntity credential = mock(LocalCredentialEntity.class);
        when(users.findById(USER_ID)).thenReturn(Optional.of(user));
        when(credentials.findByUserId(USER_ID)).thenReturn(Optional.of(credential));
        when(credential.getPasswordHash()).thenReturn("stored-hash");
        when(passwordEncoder.matches("wrong-password", "stored-hash")).thenReturn(false);

        AuthException changeError = assertThrows(AuthException.class,
                () -> service.changePassword(USER_ID, "wrong-password", "correct-horse-battery-staple"));
        AuthException unlinkError = assertThrows(AuthException.class,
                () -> service.unlinkGoogle(USER_ID, "wrong-password"));

        assertEquals("currentPassword", changeError.getPath());
        assertEquals("currentPassword", unlinkError.getPath());
        verify(credential, never()).changePassword(anyString(), any());
        verify(oauthAccounts, never()).delete(any());
        verify(refreshTokens, never()).revokeAll(any(), anyString());
    }

    private static AuthProperties properties() {
        return new AuthProperties(true, true,
                new AuthProperties.Jwt(Path.of("private.pem"), Path.of("public.pem"), "issuer", "audience", "key",
                        Duration.ofMinutes(5), Duration.ofSeconds(30)),
                new AuthProperties.Cookie("refresh", false, "Lax", "/api/v1/auth", Duration.ofDays(1)),
                new AuthProperties.Email(true, Path.of("otp.pepper"), Duration.ofMinutes(10), Duration.ofSeconds(30),
                        5, 3, "testops@example.com", "TestOps"),
                new AuthProperties.Google(false, null, null, null), "http://localhost:3000",
                new AuthProperties.Bootstrap(false, null, null, null),
                new AuthProperties.Limits(5, Duration.ofMinutes(1), 20, 10, Duration.ofMinutes(1), 20,
                        Duration.ofMinutes(1), 20, Duration.ofMinutes(1)));
    }
}
