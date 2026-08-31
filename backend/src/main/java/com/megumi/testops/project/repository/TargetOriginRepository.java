package com.megumi.testops.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.megumi.testops.project.domain.TargetOriginEntity;

public interface TargetOriginRepository extends JpaRepository<TargetOriginEntity, UUID> {
    boolean existsByEnabledTrue();
    boolean existsByOrigin(String origin);
    Optional<TargetOriginEntity> findByOrigin(String origin);
    List<TargetOriginEntity> findAllByOrderByOriginAsc();
}
