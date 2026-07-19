package com.megumi.testops.project.repository;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.project.domain.ProjectAuditEventEntity;

public interface ProjectAuditEventRepository extends JpaRepository<ProjectAuditEventEntity, UUID> { }
