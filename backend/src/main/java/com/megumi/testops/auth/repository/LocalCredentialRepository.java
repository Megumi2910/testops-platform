package com.megumi.testops.auth.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.megumi.testops.auth.domain.LocalCredentialEntity;

public interface LocalCredentialRepository extends JpaRepository<LocalCredentialEntity, UUID> {
    Optional<LocalCredentialEntity> findByUserId(UUID userId);
    boolean existsByUserId(UUID userId);
}
