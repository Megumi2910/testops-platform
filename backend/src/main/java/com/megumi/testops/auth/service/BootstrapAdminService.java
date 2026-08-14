package com.megumi.testops.auth.service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.PlatformRole;
import com.megumi.testops.auth.domain.LocalCredentialEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.LocalCredentialRepository;
import com.megumi.testops.auth.repository.UserRepository;

import jakarta.transaction.Transactional;

public class BootstrapAdminService {

    private final UserRepository users;
    private final LocalCredentialRepository credentials;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    private final AuthProperties.Bootstrap properties;
    private final Clock clock;

    public BootstrapAdminService(UserRepository users, LocalCredentialRepository credentials,
            org.springframework.security.crypto.password.PasswordEncoder passwordEncoder,
            AuthProperties.Bootstrap properties, Clock clock) {
        this.users = users;
        this.credentials = credentials;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public void initialize() {
        if (!properties.enabled()) return;
        String email = properties.email().trim().toLowerCase(Locale.ROOT);
        String password;
        try {
            password = Files.readString(properties.passwordPath(), StandardCharsets.UTF_8).trim();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read bootstrap admin password", exception);
        }
        if (password.length() < 12) throw new IllegalStateException("Bootstrap admin password is invalid");

        UserEntity existing = users.findByEmail(email).orElse(null);
        if (existing != null) {
            if (existing.getPlatformRole() != PlatformRole.ADMIN) {
                throw new IllegalStateException("Bootstrap admin email belongs to a non-admin account");
            }
            return;
        }
        if (users.count() > 0) {
            throw new IllegalStateException("Bootstrap admin cannot create an account after users already exist");
        }
        Instant now = Instant.now(clock);
        UserEntity user = new UserEntity(email, properties.displayName().trim(),
                "ACTIVE", true, now);
        user.setPlatformRole(PlatformRole.ADMIN);
        // Flush the generated user identifier before constructing the shared-primary-key credential.
        // The credential stores the user ID as its own primary key.
        user = users.saveAndFlush(user);
        credentials.save(new LocalCredentialEntity(user, passwordEncoder.encode(password), now));
    }
}
