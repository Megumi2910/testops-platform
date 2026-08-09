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
@Table(name = "test_cases")
public class TestCaseEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "suite_id", nullable = false) private TestSuiteEntity suite;
    @Column(nullable = false, length = 200) private String name;
    @Column(length = 4000) private String description;
    @Column(nullable = false, length = 20) private String status;
    @Column(nullable = false, length = 20) private String priority;
    @Column(length = 4000) private String tags;
    @Column(name = "retry_count", nullable = false) private int retryCount;
    @Column(name = "data_isolation", nullable = false) private boolean dataIsolation;
    @Version @Column(nullable = false) private long version;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "created_by", nullable = false) private UserEntity createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "archived_at") private Instant archivedAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "archived_by") private UserEntity archivedBy;
    protected TestCaseEntity() { }
    public TestCaseEntity(TestSuiteEntity suite, String name, String description, String status, String priority, String tags, int retryCount, boolean dataIsolation, UserEntity createdBy, Instant now) {
        this.id = UUID.randomUUID(); this.suite = suite; this.name = name; this.description = description; this.status = status; this.priority = priority; this.tags = tags; this.retryCount = retryCount; this.dataIsolation = dataIsolation; this.createdBy = createdBy; this.createdAt = now; this.updatedAt = now;
    }
    public void update(String name, String description, String status, String priority, String tags, int retryCount, boolean dataIsolation, Instant now) { this.name = name; this.description = description; this.status = status; this.priority = priority; this.tags = tags; this.retryCount = retryCount; this.dataIsolation = dataIsolation; this.updatedAt = now; }
    public void archive(UserEntity actor, Instant now) { status = "ARCHIVED"; archivedAt = now; archivedBy = actor; updatedAt = now; }
    public void restore(String restoredName, Instant now) { name = restoredName; status = "DRAFT"; archivedAt = null; archivedBy = null; updatedAt = now; }
    public UUID getId() { return id; } public TestSuiteEntity getSuite() { return suite; } public String getName() { return name; } public String getDescription() { return description; }
    public String getStatus() { return status; } public String getPriority() { return priority; } public String getTags() { return tags; } public int getRetryCount() { return retryCount; } public boolean isDataIsolation() { return dataIsolation; } public long getVersion() { return version; }
    public Instant getArchivedAt() { return archivedAt; } public UserEntity getArchivedBy() { return archivedBy; }
}
