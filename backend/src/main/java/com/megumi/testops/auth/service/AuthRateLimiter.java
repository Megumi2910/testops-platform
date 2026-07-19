package com.megumi.testops.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicInteger;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.megumi.testops.auth.config.AuthProperties;

import org.springframework.http.HttpStatus;

/** Bounded, single-instance security limiter; replace with shared storage when needed. */
public final class AuthRateLimiter {

    private final Cache<String, Counter> counters;

    public AuthRateLimiter(AuthProperties.Limits limits) {
        Duration expiry = max(limits.loginWindow(), limits.registrationWindow(), limits.refreshWindow(),
                limits.otpResendIpWindow());
        this.counters = Caffeine.newBuilder()
                .maximumSize(50_000)
                .expireAfterAccess(expiry)
                .build();
    }

    public void check(String scope, String identifier, int limit, Duration window) {
        if (identifier == null || identifier.isBlank()) return;
        String key = scope + ':' + digest(identifier.trim().toLowerCase(java.util.Locale.ROOT));
        Instant now = Instant.now();
        Counter counter = counters.get(key, ignored -> new Counter(now, new AtomicInteger()));
        synchronized (counter) {
            if (counter.windowStart.plus(window).isBefore(now)) {
                counter.windowStart = now;
                counter.count.set(0);
            }
            if (counter.count.incrementAndGet() > limit) {
                throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many attempts; try again later");
            }
        }
    }

    private static Duration max(Duration... values) {
        Duration result = values[0];
        for (Duration value : values) if (value.compareTo(result) > 0) result = value;
        return result;
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static final class Counter {
        private Instant windowStart;
        private final AtomicInteger count;

        private Counter(Instant windowStart, AtomicInteger count) {
            this.windowStart = windowStart;
            this.count = count;
        }
    }
}
