package com.megumi.testops.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.project.domain.ProjectVariableEntity;

public interface ProjectVariableRepository extends JpaRepository<ProjectVariableEntity, UUID> {
    List<ProjectVariableEntity> findByProjectIdOrderByKeyAsc(UUID projectId);
    Optional<ProjectVariableEntity> findByProjectIdAndKey(UUID projectId, String key);
    long countByProjectId(UUID projectId);
}
