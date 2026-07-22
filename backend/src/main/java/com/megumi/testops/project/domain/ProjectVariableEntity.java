package com.megumi.testops.project.domain;

import java.time.Instant;
import java.util.UUID;

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
@Table(name = "project_variables", uniqueConstraints = @UniqueConstraint(columnNames = {"project_id", "variable_key"}))
public class ProjectVariableEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id", nullable = false) private ProjectEntity project;
    @Column(name = "variable_key", nullable = false, length = 64) private String key;
    @Column(nullable = false) private boolean secret;
    @Column(name = "plaintext_value") private String plaintextValue;
    @Column(name = "ciphertext") private byte[] ciphertext;
    @Column(name = "nonce") private byte[] nonce;
    @Column(name = "key_version") private Integer keyVersion;
    @Version @Column(nullable = false) private long version;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected ProjectVariableEntity() { }
    private ProjectVariableEntity(ProjectEntity project, String key, boolean secret, Instant now) {
        this.id = UUID.randomUUID(); this.project = project; this.key = key; this.secret = secret; this.createdAt = now; this.updatedAt = now;
    }
    public static ProjectVariableEntity plain(ProjectEntity project, String key, String value, Instant now) {
        ProjectVariableEntity entity = new ProjectVariableEntity(project, key, false, now); entity.plaintextValue = value; return entity;
    }
    public static ProjectVariableEntity encrypted(ProjectEntity project, String key, byte[] ciphertext, byte[] nonce, int keyVersion, Instant now) {
        ProjectVariableEntity entity = new ProjectVariableEntity(project, key, true, now); entity.ciphertext = ciphertext; entity.nonce = nonce; entity.keyVersion = keyVersion; return entity;
    }
    public void updatePlain(String value, Instant now) { plaintextValue = value; updatedAt = now; }
    public void updateEncrypted(byte[] ciphertext, byte[] nonce, int keyVersion, Instant now) { this.ciphertext = ciphertext; this.nonce = nonce; this.keyVersion = keyVersion; updatedAt = now; }
    public UUID getId() { return id; }
    public ProjectEntity getProject() { return project; }
    public String getKey() { return key; }
    public boolean isSecret() { return secret; }
    public String getPlaintextValue() { return plaintextValue; }
    public byte[] getCiphertext() { return ciphertext; }
    public byte[] getNonce() { return nonce; }
    public Integer getKeyVersion() { return keyVersion; }
    public long getVersion() { return version; }
}
