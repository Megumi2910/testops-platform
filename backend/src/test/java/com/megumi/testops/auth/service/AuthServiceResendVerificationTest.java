package com.megumi.testops.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.EmailVerificationChallengeEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.EmailVerificationChallengeRepository;
import com.megumi.testops.auth.repository.LocalCredentialRepository;
import com.megumi.testops.auth.repository.OAuthAccountRepository;
import com.megumi.testops.auth.repository.UserRepository;

class AuthServiceResendVerificationTest {
    private static final Instant NOW = Instant.parse("2026-08-11T12:00:00Z");

    private final UserRepository users = mock(UserRepository.class);
    private final EmailVerificationChallengeRepository challenges = mock(EmailVerificationChallengeRepository.class);
    private final OtpHasher otpHasher = mock(OtpHasher.class);
    private final EmailDeliveryService emailDelivery = mock(EmailDeliveryService.class);
    private final AuditService audit = mock(AuditService.class);
    private final AuthService service = new AuthService(users, mock(LocalCredentialRepository.class), challenges,
            mock(OAuthAccountRepository.class), mock(PasswordEncoder.class), otpHasher, emailDelivery,
            mock(JwtTokenService.class), mock(RefreshTokenService.class), audit,
            new AuthRateLimiter(properties().limits()), properties(), Clock.fixed(NOW, ZoneOffset.UTC),
            mock(PlatformPermissionService.class));

    @Test
    void publicResendDoesNotRevealUnknownAccounts() {
        when(users.findByEmailForUpdate("missing@example.com")).thenReturn(Optional.empty());

        AuthService.ResendVerificationResult result = service.resendVerification(" Missing@Example.com ", "192.0.2.1");

        assertEquals(NOW.plusSeconds(30), result.nextResendAt());
        assertEquals(30, result.retryAfterSeconds());
        verify(challenges, never()).save(any());
        verify(emailDelivery, never()).sendVerificationCode(anyString(), anyString(), anyString(), any());
    }

    @Test
    void repeatedAuthenticatedResendIsIdempotentDuringCooldown() {
        UserEntity user = user(false);
        EmailVerificationChallengeEntity active = mock(EmailVerificationChallengeEntity.class);
        when(active.getResendAvailableAt()).thenReturn(NOW.plusSeconds(19));
        when(users.findByIdForUpdate(user.getId())).thenReturn(Optional.of(user));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                user.getId(), "REGISTRATION")).thenReturn(Optional.of(active));

        AuthService.ResendVerificationResult result = service.resendVerificationAuthenticated(user.getId(), "192.0.2.2");

        assertEquals(19, result.retryAfterSeconds());
        verify(challenges, never()).save(any());
        verify(emailDelivery, never()).sendVerificationCode(anyString(), anyString(), anyString(), any());
        verify(active, never()).invalidate(any(), anyString());
    }

    @Test
    void eligibleAuthenticatedResendInvalidatesOnceAndSendsOneMessage() {
        UserEntity user = user(false);
        EmailVerificationChallengeEntity expiredCooldown = mock(EmailVerificationChallengeEntity.class);
        when(expiredCooldown.getResendAvailableAt()).thenReturn(NOW.minusSeconds(1));
        when(users.findByIdForUpdate(user.getId())).thenReturn(Optional.of(user));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                user.getId(), "REGISTRATION")).thenReturn(Optional.of(expiredCooldown));
        when(challenges.countByUserIdAndPurposeAndIssuedAtAfter(any(), anyString(), any())).thenReturn(1L);
        when(otpHasher.hash(anyString(), anyString())).thenReturn("otp-hash");

        AuthService.ResendVerificationResult result = service.resendVerificationAuthenticated(user.getId(), "192.0.2.3");

        assertEquals(30, result.retryAfterSeconds());
        verify(expiredCooldown).invalidate(NOW, "RESENT_AUTHENTICATED");
        verify(challenges).flush();
        verify(challenges).save(any(EmailVerificationChallengeEntity.class));
        verify(emailDelivery).sendVerificationCode(anyString(), anyString(), anyString(), any());
        verify(audit).record(user, "EMAIL_VERIFICATION_RESENT", true, "192.0.2.3", null, null);
    }

    @Test
    void publicResendDoesNotRevealDeliveryOutagesForExistingAccounts() {
        UserEntity user = user(false);
        when(users.findByEmailForUpdate(user.getEmail())).thenReturn(Optional.of(user));
        when(challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
                user.getId(), "REGISTRATION")).thenReturn(Optional.empty());
        when(challenges.countByUserIdAndPurposeAndIssuedAtAfter(any(), anyString(), any())).thenReturn(0L);
        when(otpHasher.hash(anyString(), anyString())).thenReturn("otp-hash");
        org.mockito.Mockito.doThrow(new AuthException(HttpStatus.SERVICE_UNAVAILABLE,
                "email_delivery_unavailable", "Email verification is temporarily unavailable"))
                .when(emailDelivery).sendVerificationCode(anyString(), anyString(), anyString(), any());

        AuthService.ResendVerificationResult result = service.resendVerification(user.getEmail(), "192.0.2.4");

        assertEquals(30, result.retryAfterSeconds());
        verify(challenges).save(any(EmailVerificationChallengeEntity.class));
    }

    private static UserEntity user(boolean verified) {
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        when(user.getEmail()).thenReturn("qa@example.com");
        when(user.getDisplayName()).thenReturn("QA User");
        when(user.isEmailVerified()).thenReturn(verified);
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
