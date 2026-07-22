package com.megumi.testops.project.domain;

import java.time.Instant;
import java.util.UUID;

import com.megumi.testops.auth.domain.UserEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

@Entity
@Table(name = "project_members", uniqueConstraints = @UniqueConstraint(columnNames = {"project_id", "user_id"}))
public class ProjectMemberEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id", nullable = false) private ProjectEntity project;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private UserEntity user;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "assigned_by") private UserEntity assignedBy;
    @Column(nullable = false, length = 20) private String role;
    @Version @Column(nullable = false) private long version;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected ProjectMemberEntity() { }
    public ProjectMemberEntity(ProjectEntity project, UserEntity user, String role, Instant now) {
        this.id = UUID.randomUUID(); this.project = project; this.user = user; this.role = role; this.createdAt = now; this.updatedAt = now;
    }
    public void assignBy(UserEntity actor) { this.assignedBy = actor; }
    public void changeRole(String role, Instant now) { this.role = role; this.updatedAt = now; }
    public UUID getId() { return id; }
    public ProjectEntity getProject() { return project; }
    public UserEntity getUser() { return user; }
    public String getRole() { return role; }
    public long getVersion() { return version; }
    public UserEntity getAssignedBy() { return assignedBy; }
}
