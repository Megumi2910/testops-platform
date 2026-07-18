package com.megumi.testops.auth.repository;

import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;

import com.megumi.testops.auth.domain.EmailVerificationChallengeEntity;

public interface EmailVerificationChallengeRepository extends JpaRepository<EmailVerificationChallengeEntity, UUID> {

    Optional<EmailVerificationChallengeEntity> findTopByUserIdAndPurposeAndConsumedAtIsNullAndInvalidatedAtIsNullOrderByIssuedAtDesc(
            UUID userId, String purpose);

    long countByUserIdAndPurposeAndIssuedAtAfter(UUID userId, String purpose, Instant after);
}
