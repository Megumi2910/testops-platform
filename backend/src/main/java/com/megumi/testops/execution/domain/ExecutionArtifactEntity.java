package com.megumi.testops.execution.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;

@Entity @Table(name = "execution_artifacts")
public class ExecutionArtifactEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "execution_id", nullable = false) private ExecutionEntity execution;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "case_result_id") private TestCaseResultEntity caseResult;
    @Column(nullable = false, length = 30) private String type;
    @Column(name = "relative_path", nullable = false, length = 1000) private String relativePath;
    @Column(name = "content_type", nullable = false, length = 200) private String contentType;
    @Column(name = "byte_size", nullable = false) private long byteSize;
    @Column(nullable = false, length = 64) private String sha256;
    @Column(name = "secret_suppressed", nullable = false) private boolean secretSuppressed;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    protected ExecutionArtifactEntity() { }
    public ExecutionArtifactEntity(ExecutionEntity execution, TestCaseResultEntity caseResult, String type, String relativePath, String contentType, long byteSize, String sha256, boolean secretSuppressed, Instant createdAt) { this.id = UUID.randomUUID(); this.execution = execution; this.caseResult = caseResult; this.type = type; this.relativePath = relativePath; this.contentType = contentType; this.byteSize = byteSize; this.sha256 = sha256; this.secretSuppressed = secretSuppressed; this.createdAt = createdAt; }
    public UUID getId() { return id; } public UUID getCaseResultId() { return caseResult == null ? null : caseResult.getId(); } public String getType() { return type; } public String getRelativePath() { return relativePath; } public String getContentType() { return contentType; } public long getByteSize() { return byteSize; } public String getSha256() { return sha256; } public boolean isSecretSuppressed() { return secretSuppressed; } public Instant getCreatedAt() { return createdAt; }
}
