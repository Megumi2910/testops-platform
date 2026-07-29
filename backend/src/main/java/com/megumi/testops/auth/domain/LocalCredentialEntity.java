package com.megumi.testops.auth.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "local_credentials")
public class LocalCredentialEntity {
    @Id
    private UUID userId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, insertable = false, updatable = false)
    private UserEntity user;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "password_changed_at", nullable = false)
    private Instant passwordChangedAt;

    @Version
    @Column(nullable = false)
    private Long version;

    protected LocalCredentialEntity() { }

    public LocalCredentialEntity(UserEntity user, String passwordHash, Instant now) {
        setUser(user);
        this.passwordHash = passwordHash;
        this.passwordChangedAt = now;
    }

    public void changePassword(String encodedPassword, Instant now) {
        this.passwordHash = encodedPassword;
        this.passwordChangedAt = now;
    }

    public void setUser(UserEntity user) {
        this.user = user;
        if (user != null) {
            this.userId = user.getId();
        } else {
            this.userId = null;
        }
    }

    public UUID getUserId() { return userId; }
    public UserEntity getUser() { return user; }
    public String getPasswordHash() { return passwordHash; }
    public Instant getPasswordChangedAt() { return passwordChangedAt; }
}
