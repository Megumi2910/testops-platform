package com.megumi.testops.auth.repository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.domain.PlatformRole;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {

    Optional<UserEntity> findByEmail(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserEntity u where u.email = :email")
    Optional<UserEntity> findByEmailForUpdate(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserEntity u where u.id = :id")
    Optional<UserEntity> findByIdForUpdate(@Param("id") UUID id);

    boolean existsByEmail(String email);
    long countByPlatformRole(PlatformRole role);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserEntity u where u.platformRole = :role order by u.id")
    List<UserEntity> findByPlatformRoleForUpdate(@Param("role") PlatformRole role);
    List<UserEntity> findByEmailContainingIgnoreCaseOrDisplayNameContainingIgnoreCaseOrderByEmailAsc(String email, String displayName);
    Page<UserEntity> findByEmailContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(String email, String displayName, Pageable pageable);
}
