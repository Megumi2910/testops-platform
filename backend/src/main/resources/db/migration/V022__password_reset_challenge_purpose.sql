ALTER TABLE email_verification_challenges
    DROP CONSTRAINT IF EXISTS email_verification_challenges_purpose_check;

ALTER TABLE email_verification_challenges
    ADD CONSTRAINT email_verification_challenges_purpose_check
    CHECK (purpose IN ('REGISTRATION', 'ADD_PASSWORD', 'PASSWORD_RESET'));
