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
@Table(name = "projects")
public class ProjectEntity {
    @Id private UUID id;
    @Column(nullable = false, length = 120) private String name;
    @Column(length = 2000) private String description;
    @Column(name = "target_origin", nullable = false, length = 2048) private String targetOrigin;
    @Column(nullable = false, length = 20) private String status;
    @Version @Column(nullable = false) private long version;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "created_by", nullable = false) private UserEntity createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "target_check_status", nullable = false, length = 20) private String targetCheckStatus = "NOT_CHECKED";
    @Column(name = "target_checked_at") private Instant targetCheckedAt;
    @Column(name = "target_check_http_status") private Integer targetCheckHttpStatus;
    @Column(name = "target_check_reason", length = 240) private String targetCheckReason;

    protected ProjectEntity() { }

    public ProjectEntity(String name, String description, String targetOrigin, UserEntity createdBy, Instant now) {
        this.id = UUID.randomUUID(); this.name = name; this.description = description; this.targetOrigin = targetOrigin;
        this.status = "ACTIVE"; this.createdBy = createdBy; this.createdAt = now; this.updatedAt = now; this.targetCheckStatus = "NOT_CHECKED";
    }
    public void update(String name, String description, String targetOrigin, Instant now) {
        boolean targetChanged = !this.targetOrigin.equals(targetOrigin);
        this.name = name; this.description = description; this.targetOrigin = targetOrigin; this.updatedAt = now;
        if (targetChanged) resetTargetCheck();
    }
    public void touch(Instant now) { this.updatedAt = now; }
    public void archive(Instant now) { status = "ARCHIVED"; updatedAt = now; }
    public void restore(Instant now) { status = "ACTIVE"; updatedAt = now; }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getTargetOrigin() { return targetOrigin; }
    public String getStatus() { return status; }
    public long getVersion() { return version; }
    public UserEntity getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getTargetCheckStatus() { return targetCheckStatus; }
    public Instant getTargetCheckedAt() { return targetCheckedAt; }
    public Integer getTargetCheckHttpStatus() { return targetCheckHttpStatus; }
    public String getTargetCheckReason() { return targetCheckReason; }
    public void recordTargetCheck(String status, Integer httpStatus, String reason, Instant checkedAt) { this.targetCheckStatus = status; this.targetCheckHttpStatus = httpStatus; this.targetCheckReason = reason; this.targetCheckedAt = checkedAt; this.updatedAt = checkedAt; }
    public void resetTargetCheck() { this.targetCheckStatus = "NOT_CHECKED"; this.targetCheckHttpStatus = null; this.targetCheckReason = null; this.targetCheckedAt = null; }
}
