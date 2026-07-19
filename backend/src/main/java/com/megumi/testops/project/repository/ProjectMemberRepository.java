package com.megumi.testops.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.project.domain.ProjectMemberEntity;

public interface ProjectMemberRepository extends JpaRepository<ProjectMemberEntity, UUID> {
    Optional<ProjectMemberEntity> findByProjectIdAndUserId(UUID projectId, UUID userId);
    List<ProjectMemberEntity> findByProjectIdOrderByCreatedAtAsc(UUID projectId);
    List<ProjectMemberEntity> findByUserId(UUID userId);
    long countByProjectIdAndRole(UUID projectId, String role);
    boolean existsByProjectIdAndUserId(UUID projectId, UUID userId);
}
