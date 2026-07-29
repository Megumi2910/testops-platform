package com.megumi.testops.auth.repository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.domain.PlatformRole;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {

    Optional<UserEntity> findByEmail(String email);

    boolean existsByEmail(String email);
    long countByPlatformRole(PlatformRole role);
    List<UserEntity> findByEmailContainingIgnoreCaseOrDisplayNameContainingIgnoreCaseOrderByEmailAsc(String email, String displayName);
    Page<UserEntity> findByEmailContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(String email, String displayName, Pageable pageable);
}
