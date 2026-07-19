package com.megumi.testops.auth.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import com.megumi.testops.auth.domain.RefreshTokenEntity;

public interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, UUID> {

    Optional<RefreshTokenEntity> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select token from RefreshTokenEntity token where token.tokenHash = :tokenHash")
    Optional<RefreshTokenEntity> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Modifying
    @Query("update RefreshTokenEntity token set token.revokedAt = :now, token.revocationReason = :reason "
            + "where token.familyId = :familyId and token.revokedAt is null")
    int revokeFamily(@Param("familyId") UUID familyId, @Param("now") java.time.Instant now,
            @Param("reason") String reason);

    @Modifying
    @Query("update RefreshTokenEntity token set token.revokedAt = :now, token.revocationReason = :reason "
            + "where token.user.id = :userId and token.revokedAt is null")
    int revokeAllForUser(@Param("userId") UUID userId, @Param("now") java.time.Instant now,
            @Param("reason") String reason);
}
