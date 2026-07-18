package com.megumi.testops.auth.config;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Objects;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "testops.auth")
public record AuthProperties(
        boolean enabled,
        boolean registrationEnabled,
        Jwt jwt,
        Cookie cookie,
        Email email,
        Google google,
        Bootstrap bootstrap,
        Limits limits) {

    public AuthProperties {
        Objects.requireNonNull(jwt, "jwt properties are required");
        Objects.requireNonNull(cookie, "cookie properties are required");
        Objects.requireNonNull(email, "email properties are required");
        Objects.requireNonNull(google, "google properties are required");
        Objects.requireNonNull(bootstrap, "bootstrap properties are required");
        Objects.requireNonNull(limits, "limit properties are required");
        if (enabled) {
            requireText(jwt.issuer(), "jwt issuer");
            requireText(jwt.audience(), "jwt audience");
            requireText(jwt.keyId(), "jwt key id");
            requirePositive(jwt.accessTtl(), "jwt access ttl");
            requirePositive(jwt.clockSkew(), "jwt clock skew");
            if (jwt.privateKeyPath() == null || jwt.publicKeyPath() == null) {
                throw new IllegalArgumentException("jwt key paths are required when auth is enabled");
            }
            requireText(cookie.name(), "refresh cookie name");
            requireText(cookie.path(), "refresh cookie path");
            requirePositive(cookie.maxAge(), "refresh cookie max age");
            requirePositive(email.otpLifetime(), "email otp lifetime");
            requirePositive(email.resendDelay(), "email resend delay");
            if (email.otpPepperPath() == null) {
                throw new IllegalArgumentException("email OTP pepper path is required when auth is enabled");
            }
            if (registrationEnabled && !email.enabled()) {
                throw new IllegalArgumentException("email delivery must be enabled when registration is enabled");
            }
        }
        if (google.enabled()) {
            requireText(google.clientId(), "google client id");
            requireText(google.clientSecret(), "google client secret");
            requireText(google.redirectUri(), "google redirect uri");
            URI redirect = URI.create(google.redirectUri());
            if (redirect.getHost() == null || redirect.getPath() == null) {
                throw new IllegalArgumentException("google redirect uri must be an absolute URI");
            }
        }
        bootstrap.validate();
        limits.validate();
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }

    private static void requirePositive(Duration value, String name) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
    }

    public record Jwt(
            Path privateKeyPath,
            Path publicKeyPath,
            String issuer,
            String audience,
            String keyId,
            Duration accessTtl,
            Duration clockSkew) {
    }

    public record Cookie(String name, boolean secure, String sameSite, String path, Duration maxAge) {
    }

    public record Email(
            boolean enabled,
            Path otpPepperPath,
            Duration otpLifetime,
            Duration resendDelay,
            int maxAttempts,
            int maxSendsPerHour,
            Mail mail) {

        public Email {
            Objects.requireNonNull(mail, "mail properties are required");
            if (maxAttempts != 5) {
                throw new IllegalArgumentException("email OTP max attempts must be 5");
            }
            if (maxSendsPerHour < 1) {
                throw new IllegalArgumentException("email OTP send limit must be positive");
            }
        }
    }

    public record Mail(
            String host,
            int port,
            String username,
            String password,
            String fromAddress,
            String fromName,
            boolean smtpAuth,
            boolean startTls,
            Duration connectionTimeout,
            Duration readTimeout,
            Duration writeTimeout) {
    }

    public record Google(boolean enabled, String clientId, String clientSecret, String redirectUri) {
    }

    public record Bootstrap(String email, String displayName, String password) {

        private void validate() {
            boolean any = email != null || displayName != null || password != null;
            boolean all = email != null && displayName != null && password != null;
            if (any && !all) {
                throw new IllegalArgumentException("bootstrap admin settings must be supplied together");
            }
        }
    }

    public record Limits(
            int loginFailures,
            Duration loginWindow,
            int loginIpAttempts,
            int registrationAttempts,
            Duration registrationWindow,
            int refreshAttempts,
            Duration refreshWindow,
            int linkAttempts,
            Duration linkWindow) {

        private void validate() {
            if (loginFailures < 1 || loginIpAttempts < 1 || registrationAttempts < 1
                    || refreshAttempts < 1 || linkAttempts < 1) {
                throw new IllegalArgumentException("authentication limits must be positive");
            }
            requirePositive(loginWindow, "login window");
            requirePositive(registrationWindow, "registration window");
            requirePositive(refreshWindow, "refresh window");
            requirePositive(linkWindow, "link window");
        }
    }
}
