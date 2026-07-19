package com.megumi.testops.auth.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.megumi.testops.auth.api.AuthResponse;
import com.megumi.testops.auth.api.LoginRequest;
import com.megumi.testops.auth.api.RegisterRequest;
import com.megumi.testops.auth.api.UserSummaryResponse;
import com.megumi.testops.auth.api.VerifyEmailRequest;
import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.EmailVerificationChallengeEntity;
import com.megumi.testops.auth.domain.RoleEntity;
import com.megumi.testops.auth.domain.OAuthAccountEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.EmailVerificationChallengeRepository;
import com.megumi.testops.auth.repository.OAuthAccountRepository;
import com.megumi.testops.auth.repository.RoleRepository;
import com.megumi.testops.auth.repository.UserRepository;

import jakarta.transaction.Transactional;

public class AuthService {

    private final UserRepository users;
    private final RoleRepository roles;
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
    private final SecureRandom random = new SecureRandom();

    public AuthService(UserRepository users, RoleRepository roles,
            EmailVerificationChallengeRepository challenges, OAuthAccountRepository oauthAccounts,
            PasswordEncoder passwordEncoder,
            OtpHasher otpHasher, EmailDeliveryService emailDelivery, JwtTokenService jwtTokens,
            RefreshTokenService refreshTokens, AuditService audit, AuthRateLimiter rateLimiter,
            AuthProperties properties, Clock clock) {
        this.users = users;
        this.roles = roles;
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
        RoleEntity member = roles.findByCode("MEMBER")
                .orElseThrow(() -> new IllegalStateException("MEMBER role is missing"));
        Instant now = Instant.now(clock);
        UserEntity user = new UserEntity(email, passwordEncoder.encode(request.password()), request.displayName().trim(),
                "ACTIVE", false, now);
        user.addRole(member);
        users.save(user);
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
        issueAndSendChallenge(user, ip, now);
        audit.record(user, "EMAIL_VERIFICATION_RESENT", true, ip, null, null);
    }

    @Transactional
    public SessionResult login(LoginRequest request, String userAgent, String ip) {
        String email = normalizeEmail(request.email());
        rateLimiter.check("login-email", email, properties.limits().loginFailures(), properties.limits().loginWindow());
        rateLimiter.check("login-ip", ip, properties.limits().loginIpAttempts(), properties.limits().loginWindow());
        UserEntity user = users.findByEmail(email).orElse(null);
        if (user == null || user.getPasswordHash() == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            if (user != null) audit.record(user, "LOGIN_FAILED", false, ip, userAgent, null);
            throw new AuthException(HttpStatus.UNAUTHORIZED, "login_invalid", "Email or password is incorrect");
        }
        if (!user.isEmailVerified()) {
            throw new AuthException(HttpStatus.FORBIDDEN, "email_verification_required", "Verify your email before signing in");
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
            RoleEntity member = roles.findByCode("MEMBER")
                    .orElseThrow(() -> new IllegalStateException("MEMBER role is missing"));
            user = new UserEntity(normalizedEmail, null, displayName == null || displayName.isBlank() ? normalizedEmail : displayName,
                    "ACTIVE", true, now);
            user.addRole(member);
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

    private SessionResult issueSession(UserEntity user, String userAgent, String ip) {
        JwtTokenService.TokenIssue access = jwtTokens.issue(user);
        RefreshTokenService.IssuedRefreshToken refresh = refreshTokens.issue(user, userAgent, ip);
        return new SessionResult(new AuthResponse(access.token(), access.expiresInSeconds(), toSummary(user)),
                refresh.value(), refresh.expiresAt());
    }

    private void issueAndSendChallenge(UserEntity user, String ip, Instant now) {
        String otp = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        EmailVerificationChallengeEntity challenge = new EmailVerificationChallengeEntity(user,
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

    private static String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }

    private static UserSummaryResponse toSummary(UserEntity user) {
        Set<String> roleCodes = user.getRoles().stream().map(RoleEntity::getCode).collect(Collectors.toUnmodifiableSet());
        return new UserSummaryResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.isEmailVerified(), roleCodes);
    }

    public record SessionResult(AuthResponse response, String refreshToken, Instant refreshExpiresAt) { }
}
