package com.megumi.testops.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.domain.ProjectEntity;

public interface ProjectMemberRepository extends JpaRepository<ProjectMemberEntity, UUID> {
    Optional<ProjectMemberEntity> findByProjectIdAndUserId(UUID projectId, UUID userId);
    List<ProjectMemberEntity> findByProjectIdOrderByCreatedAtAsc(UUID projectId);
    List<ProjectMemberEntity> findByUserId(UUID userId);
    @Query(value = "select m.project from ProjectMemberEntity m where m.user.id = :userId and (:query = '' or lower(m.project.name) like lower(concat('%', :query, '%'))) order by lower(m.project.name) asc, m.project.id asc",
            countQuery = "select count(m) from ProjectMemberEntity m where m.user.id = :userId and (:query = '' or lower(m.project.name) like lower(concat('%', :query, '%')))")
    Page<ProjectEntity> findProjectsForUser(@Param("userId") UUID userId, @Param("query") String query, Pageable pageable);
    List<ProjectMemberEntity> findByUserIdAndProjectIdIn(UUID userId, List<UUID> projectIds);
    long countByProjectIdAndRole(UUID projectId, String role);
    boolean existsByProjectIdAndUserId(UUID projectId, UUID userId);
}
