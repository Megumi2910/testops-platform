package com.megumi.testops.auth.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "email_verification_challenges")
public class EmailVerificationChallengeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(nullable = false, length = 32)
    private String purpose;

    @Column(name = "otp_hash", nullable = false, length = 64)
    private String otpHash;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @Column(name = "invalidated_at")
    private Instant invalidatedAt;

    @Column(name = "invalidation_reason", length = 64)
    private String invalidationReason;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts;

    @Column(name = "delivery_status", nullable = false, length = 16)
    private String deliveryStatus;

    @Column(name = "last_delivery_attempt_at")
    private Instant lastDeliveryAttemptAt;

    @Column(name = "resend_available_at", nullable = false)
    private Instant resendAvailableAt;

    @Column(name = "source_ip", length = 64)
    private String sourceIp;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected EmailVerificationChallengeEntity() {
    }

    public EmailVerificationChallengeEntity(UserEntity user, String otpHash, Instant issuedAt,
            Instant expiresAt, Instant resendAvailableAt, String sourceIp) {
        this.user = user;
        this.purpose = "REGISTRATION";
        this.otpHash = otpHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.resendAvailableAt = resendAvailableAt;
        this.sourceIp = sourceIp;
        this.maxAttempts = 5;
        this.deliveryStatus = "PENDING";
        this.createdAt = issuedAt;
    }

    public boolean isActive(Instant now) {
        return consumedAt == null && invalidatedAt == null && expiresAt.isAfter(now) && failedAttempts < maxAttempts;
    }

    public void failAttempt() { failedAttempts++; }
    public void consume(Instant now) { consumedAt = now; }
    public void invalidate(Instant now, String reason) { invalidatedAt = now; invalidationReason = reason; }
    public void markDeliveryAttempt(Instant now, boolean sent) {
        lastDeliveryAttemptAt = now;
        deliveryStatus = sent ? "SENT" : "FAILED";
    }
    public UUID getId() { return id; }
    public UserEntity getUser() { return user; }
    public String getOtpHash() { return otpHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getResendAvailableAt() { return resendAvailableAt; }
    public int getFailedAttempts() { return failedAttempts; }
    public int getMaxAttempts() { return maxAttempts; }
    public String getDeliveryStatus() { return deliveryStatus; }
    public boolean isConsumed() { return consumedAt != null; }
}
