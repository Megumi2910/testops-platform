package com.megumi.testops.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
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

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.megumi.testops.auth.api.PasswordResetConfirmRequest;
import com.megumi.testops.auth.api.PasswordResetRequest;
import com.megumi.testops.auth.api.VerifyEmailRequest;
import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.EmailVerificationChallengeEntity;
import com.megumi.testops.auth.domain.LocalCredentialEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.EmailVerificationChallengeRepository;
import com.megumi.testops.auth.repository.LocalCredentialRepository;
import com.megumi.testops.auth.repository.OAuthAccountRepository;
import com.megumi.testops.auth.repository.UserRepository;

class AuthServiceRecoveryTest {
    private static final Instant NOW = Instant.parse("2026-08-12T12:00:00Z");

    private final UserRepository users = mock(UserRepository.class);
    private final LocalCredentialRepository credentials = mock(LocalCredentialRepository.class);
    private final EmailVerificationChallengeRepository challenges = mock(EmailVerificationChallengeRepository.class);
    private final OtpHasher otpHasher = mock(OtpHasher.class);
    private final EmailDeliveryService emailDelivery = mock(EmailDeliveryService.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final RefreshTokenService refreshTokens = mock(RefreshTokenService.class);
    private final AuditService audit = mock(AuditService.class);
    private final AuthProperties properties = properties();
    private final UserEntity user = user(true, "ACTIVE");
    private final AuthService service = new AuthService(users, credentials, challenges, mock(OAuthAccountRepository.class),
            passwordEncoder, otpHasher, emailDelivery, mock(JwtTokenService.class), refreshTokens, audit,
            new AuthRateLimiter(properties.limits()), properties, Clock.fixed(NOW, ZoneOffset.UTC),
            mock(PlatformPermissionService.class));

    @Test
    void expiredRegistrationOtpIsRejectedEvenWhenTheHashMatches() {
        EmailVerificationChallengeEntity challenge = mock(EmailVerificationChallengeEntity.class);
        when(users.findByEmailForUpdate("qa@example.com")).thenReturn(Optional.of(user));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(user.getId(), "REGISTRATION"))
                .thenReturn(Optional.of(challenge));
        when(challenge.isActive(NOW)).thenReturn(false);
        when(challenge.getFailedAttempts()).thenReturn(0);
        when(challenge.getMaxAttempts()).thenReturn(5);
        when(otpHasher.matches("qa@example.com", "123456", challenge.getOtpHash())).thenReturn(true);

        AuthException error = assertThrows(AuthException.class,
                () -> service.verifyEmail(new VerifyEmailRequest("qa@example.com", "123456"), "test", "192.0.2.10"));

        assertEquals("verification_invalid", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        assertEquals("otp", error.getPath());
        verify(users).findByEmailForUpdate("qa@example.com");
        verify(challenge).failAttempt();
        verify(audit).record(user, "EMAIL_VERIFICATION_FAILED", false, "192.0.2.10", "test", null);
    }

    @Test
    void unavailableRegistrationOtpTargetsOtpField() {
        when(users.findByEmailForUpdate("qa@example.com")).thenReturn(Optional.of(user));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                user.getId(), "REGISTRATION")).thenReturn(Optional.empty());

        AuthException error = assertThrows(AuthException.class,
                () -> service.verifyEmail(new VerifyEmailRequest("qa@example.com", "123456"), "test", "192.0.2.13"));

        assertEquals("verification_unavailable", error.getCode());
        assertEquals("otp", error.getPath());
    }

    @Test
    void passwordResetRequestIsGenericForUnknownAccounts() {
        when(users.findByEmailForUpdate("missing@example.com")).thenReturn(Optional.empty());

        AuthService.ResendVerificationResult result = service.requestPasswordReset(
                new PasswordResetRequest("missing@example.com"), "192.0.2.11");

        assertEquals(30, result.retryAfterSeconds());
        verify(challenges, never()).save(any());
        verify(emailDelivery, never()).sendPasswordResetCode(anyString(), anyString(), anyString(), any());
    }

    @Test
    void verifiedPasswordResetReplacesCredentialAndRevokesSessions() {
        when(users.findByEmailForUpdate("qa@example.com")).thenReturn(Optional.of(user));
        EmailVerificationChallengeEntity challenge = mock(EmailVerificationChallengeEntity.class);
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(user.getId(), "PASSWORD_RESET"))
                .thenReturn(Optional.of(challenge));
        when(challenges.countByUserIdAndPurposeAndIssuedAtAfter(any(), anyString(), any())).thenReturn(0L);
        when(otpHasher.hash(anyString(), anyString())).thenReturn("reset-hash");
        when(credentials.findByUserId(user.getId())).thenReturn(Optional.of(mock(LocalCredentialEntity.class)));
        when(otpHasher.matches("qa@example.com", "654321", "reset-hash")).thenReturn(true);
        when(passwordEncoder.encode("new-correct-horse-battery-staple")).thenReturn("new-hash");
        when(challenge.isActive(NOW)).thenReturn(true);
        when(challenge.getOtpHash()).thenReturn("reset-hash");

        service.resetPassword(new PasswordResetConfirmRequest("qa@example.com", "654321", "new-correct-horse-battery-staple"), "192.0.2.12");

        verify(challenge).consume(NOW);
        verify(credentials.findByUserId(user.getId()).orElseThrow()).changePassword("new-hash", NOW);
        verify(refreshTokens).revokeAll(user, "PASSWORD_RESET");
        verify(audit).record(user, "PASSWORD_RESET_SUCCEEDED", true, "192.0.2.12", null, null);
        verify(users).findByEmailForUpdate("qa@example.com");
    }

    @Test
    void invalidPasswordResetOtpTargetsOtpField() {
        when(users.findByEmailForUpdate("qa@example.com")).thenReturn(Optional.of(user));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                user.getId(), "PASSWORD_RESET")).thenReturn(Optional.empty());

        AuthException error = assertThrows(AuthException.class,
                () -> service.resetPassword(new PasswordResetConfirmRequest(
                        "qa@example.com", "654321", "new-correct-horse-battery-staple"), "192.0.2.14"));

        assertEquals("verification_invalid", error.getCode());
        assertEquals("otp", error.getPath());
    }

    @Test
    void fifthPasswordResetAttemptInvalidatesChallengeUnderUserLock() {
        when(users.findByEmailForUpdate("qa@example.com")).thenReturn(Optional.of(user));
        EmailVerificationChallengeEntity challenge = spy(new EmailVerificationChallengeEntity(
                user, "PASSWORD_RESET", "reset-hash", NOW.minusSeconds(1), NOW.plusSeconds(600),
                NOW.plusSeconds(30), "192.0.2.16"));
        for (int attempt = 0; attempt < 4; attempt++) challenge.failAttempt();
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                user.getId(), "PASSWORD_RESET")).thenReturn(Optional.of(challenge));
        when(otpHasher.matches("qa@example.com", "000000", "reset-hash")).thenReturn(false);

        AuthException error = assertThrows(AuthException.class,
                () -> service.resetPassword(new PasswordResetConfirmRequest(
                        "qa@example.com", "000000", "new-correct-horse-battery-staple"), "192.0.2.16"));

        assertEquals("verification_invalid", error.getCode());
        assertEquals(5, challenge.getFailedAttempts());
        assertFalse(challenge.isActive(NOW));
        verify(users).findByEmailForUpdate("qa@example.com");
        verify(challenge).invalidate(NOW, "MAX_ATTEMPTS");
    }

    @Test
    void passwordResetDeliveryFailureIsInvalidatedAndRetrySendsAgain() {
        when(users.findByEmailForUpdate("qa@example.com")).thenReturn(Optional.of(user));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                user.getId(), "PASSWORD_RESET")).thenReturn(Optional.empty());
        when(challenges.countByUserIdAndPurposeAndIssuedAtAfter(any(), anyString(), any())).thenReturn(0L);
        when(otpHasher.hash(anyString(), anyString())).thenReturn("reset-hash");
        doThrow(new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "email_delivery_unavailable",
                "Password recovery is temporarily unavailable"))
                .doNothing()
                .when(emailDelivery).sendPasswordResetCode(anyString(), anyString(), anyString(), any());

        assertThrows(AuthException.class,
                () -> service.requestPasswordReset(new PasswordResetRequest("qa@example.com"), "192.0.2.15"));
        AuthService.ResendVerificationResult retry = service.requestPasswordReset(
                new PasswordResetRequest("qa@example.com"), "192.0.2.15");

        assertEquals(30, retry.retryAfterSeconds());
        ArgumentCaptor<EmailVerificationChallengeEntity> saved =
                ArgumentCaptor.forClass(EmailVerificationChallengeEntity.class);
        verify(challenges, times(2)).save(saved.capture());
        assertEquals("FAILED", saved.getAllValues().get(0).getDeliveryStatus());
        assertFalse(saved.getAllValues().get(0).isActive(NOW));
        assertEquals("SENT", saved.getAllValues().get(1).getDeliveryStatus());
        verify(emailDelivery, times(2)).sendPasswordResetCode(anyString(), anyString(), anyString(), any());
        verify(audit).record(user, "PASSWORD_RESET_REQUESTED", true, "192.0.2.15", null, null);
    }

    private static UserEntity user(boolean verified, String status) {
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        when(user.getEmail()).thenReturn("qa@example.com");
        when(user.getDisplayName()).thenReturn("QA User");
        when(user.isEmailVerified()).thenReturn(verified);
        when(user.getStatus()).thenReturn(status);
        return user;
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
