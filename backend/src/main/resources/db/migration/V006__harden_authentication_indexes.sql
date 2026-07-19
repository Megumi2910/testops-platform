CREATE INDEX idx_email_verification_source_ip_time
    ON email_verification_challenges (source_ip, issued_at DESC);
