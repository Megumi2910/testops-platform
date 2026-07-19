package com.megumi.testops.auth.config;

import org.springframework.boot.mail.autoconfigure.MailProperties;

/** Validates cross-property authentication contracts after Spring binding. */
public final class AuthConfigurationValidator {

    public AuthConfigurationValidator(AuthProperties properties, MailProperties mailProperties) {
        if (mailProperties.getPort() < 1 || mailProperties.getPort() > 65535) {
            throw new IllegalArgumentException("mail port must be between 1 and 65535");
        }
        if (properties.registrationEnabled()) {
            requireText(mailProperties.getHost(), "mail host");
            requireText(properties.email().fromAddress(), "mail from address");
            requireText(properties.email().fromName(), "mail from name");
        }
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank when registration is enabled");
        }
    }
}
