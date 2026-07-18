package com.megumi.testops.auth.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class OAuthLoginCodeStore {

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();
    private final Clock clock;

    public OAuthLoginCodeStore(Clock clock) { this.clock = clock; }

    public String put(AuthService.SessionResult session) {
        String code = UUID.randomUUID().toString();
        entries.put(code, new Entry(session, Instant.now(clock).plus(Duration.ofMinutes(1))));
        return code;
    }

    public AuthService.SessionResult take(String code) {
        Entry entry = entries.remove(code);
        if (entry == null || entry.expiresAt().isBefore(Instant.now(clock))) return null;
        return entry.session();
    }

    private record Entry(AuthService.SessionResult session, Instant expiresAt) { }
}
