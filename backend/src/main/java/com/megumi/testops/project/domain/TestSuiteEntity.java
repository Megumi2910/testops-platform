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
import jakarta.persistence.Version;

@Entity
@Table(name = "test_suites")
public class TestSuiteEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id", nullable = false) private ProjectEntity project;
    @Column(nullable = false, length = 160) private String name;
    @Column(length = 2000) private String description;
    @Column(nullable = false, length = 20) private String status;
    @Version @Column(nullable = false) private long version;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "created_by", nullable = false) private UserEntity createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "archived_at") private Instant archivedAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "archived_by") private UserEntity archivedBy;
    protected TestSuiteEntity() { }
    public TestSuiteEntity(ProjectEntity project, String name, String description, UserEntity createdBy, Instant now) {
        this.id = UUID.randomUUID(); this.project = project; this.name = name; this.description = description; this.status = "ACTIVE"; this.createdBy = createdBy; this.createdAt = now; this.updatedAt = now;
    }
    public void update(String name, String description, Instant now) { this.name = name; this.description = description; this.updatedAt = now; }
    public void archive(Instant now) { archive(null, now); }
    public void archive(UserEntity actor, Instant now) { status = "ARCHIVED"; archivedAt = now; archivedBy = actor; updatedAt = now; }
    public void restore(String restoredName, Instant now) { name = restoredName; status = "ACTIVE"; archivedAt = null; archivedBy = null; updatedAt = now; }
    public UUID getId() { return id; } public ProjectEntity getProject() { return project; } public String getName() { return name; }
    public String getDescription() { return description; } public String getStatus() { return status; } public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; } public Instant getUpdatedAt() { return updatedAt; }
    public Instant getArchivedAt() { return archivedAt; } public UserEntity getArchivedBy() { return archivedBy; }
}
