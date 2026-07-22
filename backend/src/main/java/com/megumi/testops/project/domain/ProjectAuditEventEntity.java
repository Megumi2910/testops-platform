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

@Entity
@Table(name = "project_audit_events")
public class ProjectAuditEventEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id", nullable = false) private ProjectEntity project;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "actor_user_id") private UserEntity actor;
    @Column(name = "event_type", nullable = false, length = 64) private String eventType;
    @Column(columnDefinition = "jsonb") private String metadata;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    protected ProjectAuditEventEntity() { }
    public ProjectAuditEventEntity(ProjectEntity project, UserEntity actor, String eventType, String metadata, Instant now) { this.id = UUID.randomUUID(); this.project = project; this.actor = actor; this.eventType = eventType; this.metadata = metadata; this.createdAt = now; }
}
