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
        String frontendOrigin,
        Bootstrap bootstrap,
        Limits limits) {

    public AuthProperties {
        Objects.requireNonNull(jwt, "jwt properties are required");
        Objects.requireNonNull(cookie, "cookie properties are required");
        Objects.requireNonNull(email, "email properties are required");
        Objects.requireNonNull(google, "google properties are required");
        Objects.requireNonNull(bootstrap, "bootstrap properties are required");
        Objects.requireNonNull(limits, "limit properties are required");
        requireOrigin(frontendOrigin, "frontend origin");
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
            if (!cookie.name().matches("[A-Za-z0-9._-]+")) {
                throw new IllegalArgumentException("refresh cookie name contains invalid characters");
            }
            if (!cookie.path().startsWith("/") || cookie.path().contains("?") || cookie.path().contains("#")) {
                throw new IllegalArgumentException("refresh cookie path must be an absolute path");
            }
            if (!("lax".equalsIgnoreCase(cookie.sameSite()) || "strict".equalsIgnoreCase(cookie.sameSite())
                    || "none".equalsIgnoreCase(cookie.sameSite()))) {
                throw new IllegalArgumentException("refresh cookie SameSite must be Lax, Strict, or None");
            }
            if ("none".equalsIgnoreCase(cookie.sameSite()) && !cookie.secure()) {
                throw new IllegalArgumentException("SameSite=None cookies must be secure");
            }
            requirePositive(email.otpLifetime(), "email otp lifetime");
            requirePositive(email.resendDelay(), "email resend delay");
            if (email.otpPepperPath() == null) {
                throw new IllegalArgumentException("email OTP pepper path is required when auth is enabled");
            }
        }
        if (registrationEnabled && !enabled) {
            throw new IllegalArgumentException("authentication must be enabled when registration is enabled");
        }
        if (registrationEnabled && !email.enabled()) {
            throw new IllegalArgumentException("email delivery must be enabled when registration is enabled");
        }
        if (bootstrap.enabled() && !enabled) {
            throw new IllegalArgumentException("authentication must be enabled when bootstrap is enabled");
        }
        if (google.enabled() && !enabled) {
            throw new IllegalArgumentException("authentication must be enabled when Google sign-in is enabled");
        }
        if (google.enabled()) {
            requireText(google.clientId(), "google client id");
            requireText(google.clientSecret(), "google client secret");
            requireText(google.redirectUri(), "google redirect uri");
            URI redirect;
            try {
                redirect = URI.create(google.redirectUri());
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException("google redirect uri must be an absolute URI", exception);
            }
            if (!redirect.isAbsolute() || redirect.getHost() == null || redirect.getPath() == null
                    || !originOf(redirect).equals(originOf(URI.create(frontendOrigin)))) {
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

    private static void requireOrigin(String value, String name) {
        requireText(value, name);
        URI origin;
        try {
            origin = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(name + " must be an HTTP(S) origin", exception);
        }
        if (!origin.isAbsolute() || !("http".equalsIgnoreCase(origin.getScheme())
                || "https".equalsIgnoreCase(origin.getScheme())) || origin.getHost() == null
                || origin.getUserInfo() != null || origin.getPath() != null && !origin.getPath().isEmpty()
                && !"/".equals(origin.getPath()) || origin.getQuery() != null || origin.getFragment() != null) {
            throw new IllegalArgumentException(name + " must be an HTTP(S) origin without path, query, or fragment");
        }
    }

    private static String originOf(URI uri) {
        return uri.getScheme().toLowerCase(java.util.Locale.ROOT) + "://" + uri.getRawAuthority().toLowerCase(java.util.Locale.ROOT);
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
            String fromAddress,
            String fromName) {

        public Email {
            if (maxAttempts != 5) {
                throw new IllegalArgumentException("email OTP max attempts must be 5");
            }
            if (maxSendsPerHour < 1) {
                throw new IllegalArgumentException("email OTP send limit must be positive");
            }
        }
    }

    public record Google(boolean enabled, String clientId, String clientSecret, String redirectUri) {
    }

    public record Bootstrap(boolean enabled, String email, String displayName, Path passwordPath) {

        private void validate() {
            boolean complete = email != null && !email.isBlank() && displayName != null && !displayName.isBlank()
                    && passwordPath != null && !passwordPath.toString().isBlank();
            if (enabled && !complete) {
                throw new IllegalArgumentException("bootstrap admin settings are required when bootstrap is enabled");
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
            int otpResendIpAttempts,
            Duration otpResendIpWindow) {

        private void validate() {
            if (loginFailures < 1 || loginIpAttempts < 1 || registrationAttempts < 1
                    || refreshAttempts < 1 || otpResendIpAttempts < 1) {
                throw new IllegalArgumentException("authentication limits must be positive");
            }
            requirePositive(loginWindow, "login window");
            requirePositive(registrationWindow, "registration window");
            requirePositive(refreshWindow, "refresh window");
            requirePositive(otpResendIpWindow, "OTP resend IP window");
        }
    }
}
