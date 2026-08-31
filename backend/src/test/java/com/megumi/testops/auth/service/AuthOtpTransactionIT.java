package com.megumi.testops.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import java.time.Clock;
import java.time.Instant;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import com.megumi.testops.auth.api.PasswordResetConfirmRequest;
import com.megumi.testops.auth.api.VerifyEmailRequest;
import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.EmailVerificationChallengeEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.EmailVerificationChallengeRepository;
import com.megumi.testops.auth.repository.LocalCredentialRepository;
import com.megumi.testops.auth.repository.OAuthAccountRepository;
import com.megumi.testops.auth.repository.UserRepository;

@SpringBootTest(properties = "testops.auth.enabled=false")
@ActiveProfiles("test")
@Import(AuthOtpTransactionIT.AuthServiceTestConfiguration.class)
class AuthOtpTransactionIT {
    private static final String EXTERNAL_DATABASE_URL = System.getenv("TEST_DATABASE_URL");
    private static final PostgreSQLContainer<?> POSTGRES = externalDatabaseConfigured()
            ? null
            : new PostgreSQLContainer<>("postgres:18.4-alpine3.24");

    static {
        if (POSTGRES != null) POSTGRES.start();
    }

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("DB_URL", AuthOtpTransactionIT::databaseUrl);
        registry.add("DB_USERNAME", AuthOtpTransactionIT::databaseUsername);
        registry.add("DB_PASSWORD", AuthOtpTransactionIT::databasePassword);
        registry.add("spring.datasource.url", AuthOtpTransactionIT::databaseUrl);
        registry.add("spring.datasource.username", AuthOtpTransactionIT::databaseUsername);
        registry.add("spring.datasource.password", AuthOtpTransactionIT::databasePassword);
    }

    @AfterAll
    static void stopManagedDatabase() {
        if (POSTGRES != null) POSTGRES.stop();
    }

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository users;

    @Autowired
    private EmailVerificationChallengeRepository challenges;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void registrationFifthFailureCommitsThroughTransactionalProxy() {
        Fixture fixture = fixture("REGISTRATION", "registration-transaction@example.test");

        AuthException error = assertThrows(AuthException.class,
                () -> authService.verifyEmail(
                        new VerifyEmailRequest(fixture.user().getEmail(), "000000"),
                        "transaction-regression", "192.0.2.30"));

        assertEquals("verification_invalid", error.getCode());
        assertPersistedFifthFailure(fixture.challenge());
    }

    @Test
    void passwordResetFifthFailureCommitsThroughTransactionalProxy() {
        Fixture fixture = fixture("PASSWORD_RESET", "reset-transaction@example.test");

        AuthException error = assertThrows(AuthException.class,
                () -> authService.resetPassword(new PasswordResetConfirmRequest(
                        fixture.user().getEmail(), "000000", "correct-horse-battery-staple"), "192.0.2.31"));

        assertEquals("verification_invalid", error.getCode());
        assertPersistedFifthFailure(fixture.challenge());
    }

    @Test
    void addPasswordFifthFailureCommitsThroughTransactionalProxy() {
        Fixture fixture = fixture("ADD_PASSWORD", "add-password-transaction@example.test");

        AuthException error = assertThrows(AuthException.class,
                () -> authService.confirmPasswordSetup(
                        fixture.user().getId(), "000000", "correct-horse-battery-staple"));

        assertEquals("verification_invalid", error.getCode());
        assertPersistedFifthFailure(fixture.challenge());
    }

    private Fixture fixture(String purpose, String email) {
        Instant now = Instant.now();
        UserEntity user = users.saveAndFlush(new UserEntity(email, "Transaction regression", "ACTIVE", true, now));
        EmailVerificationChallengeEntity challenge = new EmailVerificationChallengeEntity(
                user, purpose, "otp-hash", now.minusSeconds(1), now.plusSeconds(600), now.plusSeconds(30),
                "192.0.2.30");
        for (int attempt = 0; attempt < 4; attempt++) challenge.failAttempt();
        return new Fixture(user, challenges.saveAndFlush(challenge));
    }

    private void assertPersistedFifthFailure(EmailVerificationChallengeEntity challenge) {
        Integer failedAttempts = jdbc.queryForObject(
                "select failed_attempts from email_verification_challenges where id = ?",
                Integer.class, challenge.getId());
        java.sql.Timestamp invalidatedAt = jdbc.queryForObject(
                "select invalidated_at from email_verification_challenges where id = ?",
                java.sql.Timestamp.class, challenge.getId());
        String reason = jdbc.queryForObject(
                "select invalidation_reason from email_verification_challenges where id = ?",
                String.class, challenge.getId());

        assertEquals(5, failedAttempts);
        assertNotNull(invalidatedAt);
        assertEquals("MAX_ATTEMPTS", reason);
    }

    private static boolean externalDatabaseConfigured() {
        return EXTERNAL_DATABASE_URL != null && !EXTERNAL_DATABASE_URL.isBlank();
    }

    private static String databaseUrl() {
        return externalDatabaseConfigured() ? EXTERNAL_DATABASE_URL : POSTGRES.getJdbcUrl();
    }

    private static String databaseUsername() {
        return externalDatabaseConfigured() ? System.getenv("TEST_DATABASE_USERNAME") : POSTGRES.getUsername();
    }

    private static String databasePassword() {
        return externalDatabaseConfigured() ? System.getenv("TEST_DATABASE_PASSWORD") : POSTGRES.getPassword();
    }

    private record Fixture(UserEntity user, EmailVerificationChallengeEntity challenge) { }

    @TestConfiguration(proxyBeanMethods = false)
    static class AuthServiceTestConfiguration {
        @Bean
        AuthService transactionRegressionAuthService(UserRepository users,
                LocalCredentialRepository credentials, EmailVerificationChallengeRepository challenges,
                OAuthAccountRepository oauthAccounts, AuthProperties properties) {
            return new AuthService(users, credentials, challenges, oauthAccounts, mock(PasswordEncoder.class),
                    mock(OtpHasher.class), mock(EmailDeliveryService.class), mock(JwtTokenService.class),
                    mock(RefreshTokenService.class), mock(AuditService.class),
                    new AuthRateLimiter(properties.limits()), properties, Clock.systemUTC(),
                    mock(PlatformPermissionService.class));
        }
    }
}
