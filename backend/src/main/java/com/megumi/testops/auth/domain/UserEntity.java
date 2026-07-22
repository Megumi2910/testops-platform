package com.megumi.testops.auth.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(nullable = false, length = 20)
    private String status;

    @Enumerated(EnumType.STRING)
    @Column(name = "platform_role", nullable = false, length = 20)
    private PlatformRole platformRole;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;

    @Column(name = "token_version", nullable = false)
    private int tokenVersion;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    protected UserEntity() {
    }

    public UserEntity(String email, String displayName, String status,
            boolean emailVerified, Instant now) {
        this.email = email;
        this.displayName = displayName;
        this.status = status;
        this.platformRole = PlatformRole.MEMBER;
        this.emailVerified = emailVerified;
        this.tokenVersion = 0;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void setPlatformRole(PlatformRole role) { this.platformRole = role; }
    public void setStatus(String status, Instant now) { this.status = status; this.updatedAt = now; }

    public void markVerified(Instant now) {
        emailVerified = true;
        updatedAt = now;
    }

    public void markLogin(Instant now) {
        lastLoginAt = now;
        updatedAt = now;
    }

    public void incrementTokenVersion(Instant now) {
        tokenVersion++;
        updatedAt = now;
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getAvatarUrl() { return avatarUrl; }
    public String getStatus() { return status; }
    public boolean isEmailVerified() { return emailVerified; }
    public int getTokenVersion() { return tokenVersion; }
    public Instant getLastLoginAt() { return lastLoginAt; }
    public Instant getCreatedAt() { return createdAt; }
    public PlatformRole getPlatformRole() { return platformRole; }
}
