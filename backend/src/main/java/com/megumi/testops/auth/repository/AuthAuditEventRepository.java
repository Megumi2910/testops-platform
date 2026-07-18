package com.megumi.testops.auth.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.megumi.testops.auth.domain.AuthAuditEventEntity;

public interface AuthAuditEventRepository extends JpaRepository<AuthAuditEventEntity, UUID> {
}
