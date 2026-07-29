package com.megumi.testops.auth.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.HashSet;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.megumi.testops.auth.api.AuthResponse;
import com.megumi.testops.auth.api.LoginRequest;
import com.megumi.testops.auth.api.RegisterRequest;
import com.megumi.testops.auth.api.UserSummaryResponse;
import com.megumi.testops.auth.api.VerifyEmailRequest;
import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.EmailVerificationChallengeEntity;
import com.megumi.testops.auth.domain.OAuthAccountEntity;
import com.megumi.testops.auth.domain.LocalCredentialEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.EmailVerificationChallengeRepository;
import com.megumi.testops.auth.repository.OAuthAccountRepository;
import com.megumi.testops.auth.repository.LocalCredentialRepository;
import com.megumi.testops.auth.repository.UserRepository;

import jakarta.transaction.Transactional;

public class AuthService {

    private final UserRepository users;
    private final LocalCredentialRepository credentials;
    private final EmailVerificationChallengeRepository challenges;
    private final OAuthAccountRepository oauthAccounts;
    private final PasswordEncoder passwordEncoder;
    private final OtpHasher otpHasher;
    private final EmailDeliveryService emailDelivery;
    private final JwtTokenService jwtTokens;
    private final RefreshTokenService refreshTokens;
    private final AuthRateLimiter rateLimiter;
    private final AuditService audit;
    private final AuthProperties properties;
    private final Clock clock;
    private final PlatformPermissionService platformPermissions;
    private final SecureRandom random = new SecureRandom();

    public AuthService(UserRepository users, LocalCredentialRepository credentials,
            EmailVerificationChallengeRepository challenges, OAuthAccountRepository oauthAccounts,
            PasswordEncoder passwordEncoder,
            OtpHasher otpHasher, EmailDeliveryService emailDelivery, JwtTokenService jwtTokens,
            RefreshTokenService refreshTokens, AuditService audit, AuthRateLimiter rateLimiter,
            AuthProperties properties, Clock clock, PlatformPermissionService platformPermissions) {
        this.users = users;
        this.credentials = credentials;
        this.challenges = challenges;
        this.oauthAccounts = oauthAccounts;
        this.passwordEncoder = passwordEncoder;
        this.otpHasher = otpHasher;
        this.emailDelivery = emailDelivery;
        this.jwtTokens = jwtTokens;
        this.refreshTokens = refreshTokens;
        this.audit = audit;
        this.rateLimiter = rateLimiter;
        this.properties = properties;
        this.clock = clock;
        this.platformPermissions = platformPermissions;
    }

    @Transactional(dontRollbackOn = AuthException.class)
    public void register(RegisterRequest request, String ip) {
        if (!properties.registrationEnabled()) {
            throw new AuthException(HttpStatus.NOT_FOUND, "registration_disabled", "Registration is not enabled");
        }
        String email = normalizeEmail(request.email());
        rateLimiter.check("registration-ip", ip, properties.limits().registrationAttempts(),
                properties.limits().registrationWindow());
        if (users.existsByEmail(email)) {
            throw new AuthException(HttpStatus.CONFLICT, "email_unavailable", "Unable to create an account with this email");
        }
        Instant now = Instant.now(clock);
        UserEntity user = new UserEntity(email, request.displayName().trim(),
                "ACTIVE", false, now);
        user = users.save(user);
        credentials.save(new LocalCredentialEntity(user, passwordEncoder.encode(request.password()), now));
        issueAndSendChallenge(user, ip, now);
        audit.record(user, "REGISTRATION_REQUESTED", true, ip, null, null);
    }

    @Transactional
    public SessionResult verifyEmail(VerifyEmailRequest request, String userAgent, String ip) {
        UserEntity user = userByEmail(request.email());
        EmailVerificationChallengeEntity challenge = challenges
                .findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(user.getId(), "REGISTRATION")
                .orElseThrow(() -> new AuthException(HttpStatus.BAD_REQUEST, "verification_unavailable", "Verification code is invalid or expired"));
        Instant now = Instant.now(clock);
        if (!challenge.isActive(now) || !otpHasher.matches(user.getEmail(), request.otp(), challenge.getOtpHash())) {
            challenge.failAttempt();
            if (challenge.getFailedAttempts() >= challenge.getMaxAttempts()) {
                challenge.invalidate(now, "MAX_ATTEMPTS");
            }
            audit.record(user, "EMAIL_VERIFICATION_FAILED", false, ip, userAgent, null);
            throw new AuthException(HttpStatus.BAD_REQUEST, "verification_invalid", "Verification code is invalid or expired");
        }
        challenge.consume(now);
        user.markVerified(now);
        user.incrementTokenVersion(now);
        refreshTokens.revokeAll(user, "EMAIL_VERIFIED");
        user.markLogin(now);
        audit.record(user, "EMAIL_VERIFIED", true, ip, userAgent, null);
        return issueSession(user, userAgent, ip);
    }

    @Transactional(dontRollbackOn = AuthException.class)
    public void resendVerification(String email, String ip) {
        rateLimiter.check("otp-resend-ip", ip, properties.limits().otpResendIpAttempts(),
                properties.limits().otpResendIpWindow());
        UserEntity user = userByEmail(email);
        if (user.isEmailVerified()) return;
        Instant now = Instant.now(clock);
        if (challenges.countByUserIdAndPurposeAndIssuedAtAfter(user.getId(), "REGISTRATION",
                now.minus(java.time.Duration.ofHours(1))) >= properties.email().maxSendsPerHour()) {
            throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "verification_rate_limited", "Verification email limit reached; try again later");
        }
        EmailVerificationChallengeEntity previous = challenges
                .findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(user.getId(), "REGISTRATION")
                .orElse(null);
        if (previous != null && previous.getResendAvailableAt().isAfter(now)) {
            throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "verification_resend_cooldown", "Please wait before requesting another code");
        }
        if (previous != null) previous.invalidate(now, "RESENT");
        if (previous != null) challenges.flush();
        issueAndSendChallenge(user, ip, now);
        audit.record(user, "EMAIL_VERIFICATION_RESENT", true, ip, null, null);
    }

    @Transactional(dontRollbackOn = AuthException.class)
    public void resendVerificationAuthenticated(UUID userId, String ip) {
        rateLimiter.check("otp-resend-ip", ip, properties.limits().otpResendIpAttempts(),
                properties.limits().otpResendIpWindow());
        UserEntity user = userById(userId);
        if (user.isEmailVerified()) return;
        Instant now = Instant.now(clock);
        if (challenges.countByUserIdAndPurposeAndIssuedAtAfter(user.getId(), "REGISTRATION",
                now.minus(java.time.Duration.ofHours(1))) >= properties.email().maxSendsPerHour()) {
            throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "verification_rate_limited", "Verification email limit reached; try again later");
        }
        EmailVerificationChallengeEntity previous = challenges
                .findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(user.getId(), "REGISTRATION")
                .orElse(null);
        if (previous != null) previous.invalidate(now, "RESENT_AUTHENTICATED");
        if (previous != null) challenges.flush();
        issueAndSendChallenge(user, ip, now);
        audit.record(user, "EMAIL_VERIFICATION_RESENT", true, ip, null, null);
    }

    @Transactional
    public SessionResult login(LoginRequest request, String userAgent, String ip) {
        String email = normalizeEmail(request.email());
        rateLimiter.check("login-email", email, properties.limits().loginFailures(), properties.limits().loginWindow());
        rateLimiter.check("login-ip", ip, properties.limits().loginIpAttempts(), properties.limits().loginWindow());
        UserEntity user = users.findByEmail(email).orElse(null);
        LocalCredentialEntity credential = user == null ? null : credentials.findByUserId(user.getId()).orElse(null);
        if (user == null || credential == null || !passwordEncoder.matches(request.password(), credential.getPasswordHash())) {
            if (user != null) audit.record(user, "LOGIN_FAILED", false, ip, userAgent, null);
            throw new AuthException(HttpStatus.UNAUTHORIZED, "login_invalid", "Email or password is incorrect");
        }
        if (!"ACTIVE".equals(user.getStatus())) {
            throw new AuthException(HttpStatus.FORBIDDEN, "account_unavailable", "This account is unavailable");
        }
        user.markLogin(Instant.now(clock));
        audit.record(user, "LOGIN_SUCCEEDED", true, ip, userAgent, null);
        return issueSession(user, userAgent, ip);
    }

    @Transactional
    public SessionResult oauthLogin(String provider, String subject, String email, String displayName,
            String avatarUrl, String userAgent, String ip) {
        String normalizedEmail = normalizeEmail(email);
        Instant now = Instant.now(clock);
        OAuthAccountEntity existing = oauthAccounts.findByProviderAndProviderSubject(provider, subject).orElse(null);
        UserEntity user;
        if (existing != null) {
            user = existing.getUser();
            existing.markLogin(now);
        } else {
            if (users.existsByEmail(normalizedEmail)) {
                throw new AuthException(HttpStatus.CONFLICT, "account_link_required",
                        "This email already has a password account; sign in with your password before linking Google");
            }
            user = new UserEntity(normalizedEmail, displayName == null || displayName.isBlank() ? normalizedEmail : displayName,
                    "ACTIVE", true, now);
            user = users.save(user);
            oauthAccounts.save(new OAuthAccountEntity(user, provider, subject, normalizedEmail, now));
        }
        if (!"ACTIVE".equals(user.getStatus())) {
            throw new AuthException(HttpStatus.FORBIDDEN, "account_unavailable", "This account is unavailable");
        }
        user.markLogin(now);
        audit.record(user, "GOOGLE_LOGIN_SUCCEEDED", true, ip, userAgent, null);
        return issueSession(user, userAgent, ip);
    }

    @Transactional
    public SessionResult linkGoogle(UUID userId, String subject, String email, String displayName, String avatarUrl,
            String userAgent, String ip) {
        UserEntity user = userById(userId);
        String normalizedEmail = normalizeEmail(email);
        if (!user.isEmailVerified() || !user.getEmail().equals(normalizedEmail)) throw new AuthException(HttpStatus.CONFLICT, "email_mismatch", "The Google account email must match the verified account email");
        if (oauthAccounts.findByProviderAndProviderSubject("GOOGLE", subject).isPresent()) throw new AuthException(HttpStatus.CONFLICT, "google_account_linked", "This Google account is already linked");
        oauthAccounts.save(new OAuthAccountEntity(user, "GOOGLE", subject, normalizedEmail, Instant.now(clock)));
        user.incrementTokenVersion(Instant.now(clock));
        return issueSession(user, userAgent, ip);
    }

    @Transactional(dontRollbackOn = AuthException.class)
    public SessionResult refresh(String rawRefreshToken, String userAgent, String ip) {
        rateLimiter.check("refresh-ip", ip, properties.limits().refreshAttempts(), properties.limits().refreshWindow());
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(rawRefreshToken, userAgent, ip);
        JwtTokenService.TokenIssue access = jwtTokens.issue(rotation.user());
        return new SessionResult(new AuthResponse(access.token(), access.expiresInSeconds(), toSummary(rotation.user())),
                rotation.value(), rotation.expiresAt());
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.revoke(rawRefreshToken, "LOGOUT");
    }

    @Transactional
    public void revokeAllSessions(UUID userId, String userAgent, String ip) {
        UserEntity user = users.findById(userId)
                .orElseThrow(() -> new AuthException(HttpStatus.NOT_FOUND, "user_not_found", "User was not found"));
        user.incrementTokenVersion(Instant.now(clock));
        refreshTokens.revokeAll(user, "REVOKE_ALL");
        audit.record(user, "SESSIONS_REVOKED", true, ip, userAgent, null);
    }

    @Transactional
    public UserSummaryResponse currentUser(UUID userId) {
        return toSummary(users.findById(userId)
                .orElseThrow(() -> new AuthException(HttpStatus.UNAUTHORIZED, "user_not_found", "User was not found")));
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        UserEntity user = userById(userId);
        LocalCredentialEntity credential = credentials.findByUserId(userId).orElseThrow(() -> new AuthException(HttpStatus.CONFLICT, "password_not_configured", "This account does not have a password login"));
        if (!passwordEncoder.matches(currentPassword, credential.getPasswordHash())) throw new AuthException(HttpStatus.UNAUTHORIZED, "password_invalid", "Current password is incorrect");
        credential.changePassword(passwordEncoder.encode(newPassword), Instant.now(clock));
        user.incrementTokenVersion(Instant.now(clock));
        refreshTokens.revokeAll(user, "PASSWORD_CHANGED");
    }

    @Transactional
    public void beginPasswordSetup(UUID userId, String ip) {
        UserEntity user = userById(userId);
        if (credentials.existsByUserId(userId)) throw new AuthException(HttpStatus.CONFLICT, "password_already_configured", "This account already has a password login");
        Instant now = Instant.now(clock);
        issueAndSendChallenge(user, "ADD_PASSWORD", ip, now);
    }

    @Transactional
    public void confirmPasswordSetup(UUID userId, String otp, String password) {
        UserEntity user = userById(userId);
        EmailVerificationChallengeEntity challenge = challenges.findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(userId, "ADD_PASSWORD").orElseThrow(() -> new AuthException(HttpStatus.BAD_REQUEST, "verification_unavailable", "Verification code is invalid or expired"));
        Instant now = Instant.now(clock);
        if (!challenge.isActive(now) || !otpHasher.matches(user.getEmail(), otp, challenge.getOtpHash())) throw new AuthException(HttpStatus.BAD_REQUEST, "verification_invalid", "Verification code is invalid or expired");
        challenge.consume(now); credentials.save(new LocalCredentialEntity(user, passwordEncoder.encode(password), now));
    }

    @Transactional
    public void unlinkGoogle(UUID userId, String currentPassword) {
        UserEntity user = userById(userId);
        LocalCredentialEntity credential = credentials.findByUserId(userId).orElseThrow(() -> new AuthException(HttpStatus.CONFLICT, "password_required", "Set a password before unlinking Google"));
        if (!passwordEncoder.matches(currentPassword, credential.getPasswordHash())) throw new AuthException(HttpStatus.UNAUTHORIZED, "password_invalid", "Current password is incorrect");
        oauthAccounts.findByUserIdAndProvider(userId, "GOOGLE").ifPresent(oauthAccounts::delete);
        user.incrementTokenVersion(Instant.now(clock)); refreshTokens.revokeAll(user, "GOOGLE_UNLINKED");
    }

    private SessionResult issueSession(UserEntity user, String userAgent, String ip) {
        JwtTokenService.TokenIssue access = jwtTokens.issue(user);
        RefreshTokenService.IssuedRefreshToken refresh = refreshTokens.issue(user, userAgent, ip);
        return new SessionResult(new AuthResponse(access.token(), access.expiresInSeconds(), toSummary(user)),
                refresh.value(), refresh.expiresAt());
    }

    private void issueAndSendChallenge(UserEntity user, String ip, Instant now) { issueAndSendChallenge(user, "REGISTRATION", ip, now); }

    private void issueAndSendChallenge(UserEntity user, String purpose, String ip, Instant now) {
        String otp = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        EmailVerificationChallengeEntity challenge = new EmailVerificationChallengeEntity(user, purpose,
                otpHasher.hash(user.getEmail(), otp), now, now.plus(properties.email().otpLifetime()),
                now.plus(properties.email().resendDelay()), ip);
        challenges.save(challenge);
        try {
            emailDelivery.sendVerificationCode(user.getEmail(), user.getDisplayName(), otp, challenge.getExpiresAt());
            challenge.markDeliveryAttempt(now, true);
        } catch (RuntimeException exception) {
            challenge.markDeliveryAttempt(now, false);
            throw exception;
        }
    }

    private UserEntity userByEmail(String email) {
        return users.findByEmail(normalizeEmail(email))
                .orElseThrow(() -> new AuthException(HttpStatus.BAD_REQUEST, "verification_unavailable", "Verification code is invalid or expired"));
    }

    private UserEntity userById(UUID id) { return users.findById(id).orElseThrow(() -> new AuthException(HttpStatus.UNAUTHORIZED, "user_not_found", "User was not found")); }

    private static String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }

    private UserSummaryResponse toSummary(UserEntity user) {
        HashSet<String> methods = new HashSet<>();
        if (credentials.existsByUserId(user.getId())) methods.add("PASSWORD");
        if (oauthAccounts.existsByUserIdAndProvider(user.getId(), "GOOGLE")) methods.add("GOOGLE");
        return new UserSummaryResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl(),
                user.isEmailVerified(), user.getStatus(), user.getPlatformRole().name(), Set.copyOf(methods),
                platformPermissions.permissions(user));
    }

    public record SessionResult(AuthResponse response, String refreshToken, Instant refreshExpiresAt) { }
}
