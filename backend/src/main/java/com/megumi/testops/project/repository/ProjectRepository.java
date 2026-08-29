package com.megumi.testops.project.repository;

import java.util.UUID;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.project.domain.ProjectEntity;

public interface ProjectRepository extends JpaRepository<ProjectEntity, UUID> {
    long countByTargetOrigin(String targetOrigin);
    Page<ProjectEntity> findByNameContainingIgnoreCase(String name, Pageable pageable);
    boolean existsByNameIgnoreCase(String name);
    Optional<ProjectEntity> findByNameIgnoreCase(String name);
}
