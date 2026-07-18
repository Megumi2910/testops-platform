package com.megumi.testops.auth.service;

import java.time.Clock;
import java.time.Instant;

import com.megumi.testops.auth.domain.AuthAuditEventEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.AuthAuditEventRepository;

public class AuditService {

    private final AuthAuditEventRepository repository;
    private final Clock clock;

    public AuditService(AuthAuditEventRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public void record(UserEntity user, String eventType, boolean success, String ip, String userAgent,
            String metadata) {
        repository.save(new AuthAuditEventEntity(user, eventType, success, ip, userAgent, metadata,
                Instant.now(clock)));
    }
}
