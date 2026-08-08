package com.megumi.testops.execution.domain;

import java.util.UUID;

import com.megumi.testops.project.domain.ProjectVariableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "execution_variable_snapshots")
public class ExecutionVariableSnapshotEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "execution_id", nullable = false) private ExecutionEntity execution;
    @Column(name = "variable_key", nullable = false, length = 64) private String key;
    @Column(name = "value") private String value;
    @Column(nullable = false) private boolean secret;
    @Column(name = "ciphertext") private byte[] ciphertext;
    @Column(name = "nonce") private byte[] nonce;
    @Column(name = "key_version") private Integer keyVersion;

    protected ExecutionVariableSnapshotEntity() { }

    private ExecutionVariableSnapshotEntity(ExecutionEntity execution, String key, boolean secret) {
        this.id = UUID.randomUUID();
        this.execution = execution;
        this.key = key;
        this.secret = secret;
    }

    public static ExecutionVariableSnapshotEntity plain(ExecutionEntity execution, ProjectVariableEntity variable) {
        ExecutionVariableSnapshotEntity snapshot = new ExecutionVariableSnapshotEntity(execution, variable.getKey(), false);
        snapshot.value = variable.getPlaintextValue();
        return snapshot;
    }

    public static ExecutionVariableSnapshotEntity secret(ExecutionEntity execution, ProjectVariableEntity variable) {
        ExecutionVariableSnapshotEntity snapshot = new ExecutionVariableSnapshotEntity(execution, variable.getKey(), true);
        snapshot.ciphertext = variable.getCiphertext();
        snapshot.nonce = variable.getNonce();
        snapshot.keyVersion = variable.getKeyVersion();
        return snapshot;
    }

    public UUID getId() { return id; }
    public ExecutionEntity getExecution() { return execution; }
    public String getKey() { return key; }
    public String getValue() { return value; }
    public boolean isSecret() { return secret; }
    public byte[] getCiphertext() { return ciphertext; }
    public byte[] getNonce() { return nonce; }
    public Integer getKeyVersion() { return keyVersion; }
}
