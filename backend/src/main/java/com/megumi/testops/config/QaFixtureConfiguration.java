package com.megumi.testops.config;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.megumi.testops.auth.domain.LocalCredentialEntity;
import com.megumi.testops.auth.domain.PlatformRole;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.LocalCredentialRepository;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectRepository;

@Configuration
@Profile("local-qa")
@ConditionalOnProperty(prefix = "testops.qa-fixtures", name = "enabled", havingValue = "true")
public class QaFixtureConfiguration {
    private static final Logger log = LoggerFactory.getLogger(QaFixtureConfiguration.class);
    private static final String PRIMARY_PROJECT = "[QA] Primary workspace";
    private static final String ISOLATION_PROJECT = "[QA] Isolation workspace";

    @Bean
    ApplicationRunner qaFixtureRunner(QaFixtureProperties properties, UserRepository users,
            LocalCredentialRepository credentials, ProjectRepository projects,
            ProjectMemberRepository members, PasswordEncoder passwordEncoder,
            PlatformTransactionManager transactionManager, Clock clock) {
        return args -> {
            String password = Files.readString(properties.passwordPath(), StandardCharsets.UTF_8).trim();
            if (password.length() < 12) {
                throw new IllegalStateException("QA fixture password must contain at least 12 characters");
            }
            String encoded = passwordEncoder.encode(password);
            TransactionTemplate transaction = new TransactionTemplate(transactionManager);
            transaction.executeWithoutResult(status -> seed(properties, users, credentials, projects,
                    members, encoded, Instant.now(clock)));
            log.info("Local QA fixtures are ready under the qa.*@testops.local namespace");
        };
    }

    private static void seed(QaFixtureProperties properties, UserRepository users,
            LocalCredentialRepository credentials, ProjectRepository projects,
            ProjectMemberRepository members, String encodedPassword, Instant now) {
        Map<String, FixtureUser> definitions = new LinkedHashMap<>();
        definitions.put("admin", new FixtureUser("qa.admin@testops.local", "QA Administrator", PlatformRole.ADMIN, "ACTIVE", true));
        definitions.put("manager", new FixtureUser("qa.manager@testops.local", "QA Project Manager", PlatformRole.MEMBER, "ACTIVE", true));
        definitions.put("testManager", new FixtureUser("qa.test-manager@testops.local", "QA Test Manager", PlatformRole.MEMBER, "ACTIVE", true));
        definitions.put("tester", new FixtureUser("qa.tester@testops.local", "QA Tester", PlatformRole.MEMBER, "ACTIVE", true));
        definitions.put("viewer", new FixtureUser("qa.viewer@testops.local", "QA Viewer", PlatformRole.MEMBER, "ACTIVE", true));
        definitions.put("nonMember", new FixtureUser("qa.non-member@testops.local", "QA Non-member", PlatformRole.MEMBER, "ACTIVE", true));
        definitions.put("isolationManager", new FixtureUser("qa.isolation-manager@testops.local", "QA Isolation Manager", PlatformRole.MEMBER, "ACTIVE", true));
        definitions.put("unverified", new FixtureUser("qa.unverified@testops.local", "QA Unverified", PlatformRole.MEMBER, "ACTIVE", false));
        definitions.put("locked", new FixtureUser("qa.locked@testops.local", "QA Locked", PlatformRole.MEMBER, "LOCKED", true));
        definitions.put("disabled", new FixtureUser("qa.disabled@testops.local", "QA Disabled", PlatformRole.MEMBER, "DISABLED", true));

        Map<String, UserEntity> fixtureUsers = new LinkedHashMap<>();
        definitions.forEach((key, definition) -> fixtureUsers.put(key,
                ensureUser(definition, users, credentials, encodedPassword, now)));

        UserEntity manager = fixtureUsers.get("manager");
        UserEntity isolationManager = fixtureUsers.get("isolationManager");
        ProjectEntity primary = ensureProject(PRIMARY_PROJECT,
                "[QA-FIXTURE] Role and definition lifecycle coverage", properties.targetOrigin(), manager, projects, now);
        ProjectEntity isolation = ensureProject(ISOLATION_PROJECT,
                "[QA-FIXTURE] Cross-project isolation coverage", properties.targetOrigin(), isolationManager, projects, now);

        ensureMembership(primary, manager, "PROJECT_MANAGER", manager, members, now);
        ensureMembership(primary, fixtureUsers.get("testManager"), "TEST_MANAGER", manager, members, now);
        ensureMembership(primary, fixtureUsers.get("tester"), "TESTER", manager, members, now);
        ensureMembership(primary, fixtureUsers.get("viewer"), "VIEWER", manager, members, now);
        ensureMembership(isolation, isolationManager, "PROJECT_MANAGER", isolationManager, members, now);
        removeMembership(isolation, manager, members);
        removeMembership(isolation, fixtureUsers.get("viewer"), members);
    }

    private static UserEntity ensureUser(FixtureUser fixture, UserRepository users,
            LocalCredentialRepository credentials, String encodedPassword, Instant now) {
        UserEntity user = users.findByEmail(fixture.email()).orElseGet(() ->
                users.saveAndFlush(new UserEntity(fixture.email(), fixture.displayName(), fixture.status(),
                        fixture.verified(), now)));
        user.applyQaFixtureState(fixture.platformRole(), fixture.status(), fixture.verified(), now);
        UserEntity savedUser = users.saveAndFlush(user);
        LocalCredentialEntity credential = credentials.findByUserId(savedUser.getId())
                .orElseGet(() -> new LocalCredentialEntity(savedUser, encodedPassword, now));
        credential.changePassword(encodedPassword, now);
        credentials.save(credential);
        return savedUser;
    }

    private static ProjectEntity ensureProject(String name, String description, String targetOrigin,
            UserEntity manager, ProjectRepository projects, Instant now) {
        ProjectEntity project = projects.findByNameIgnoreCase(name)
                .orElseGet(() -> new ProjectEntity(name, description, targetOrigin, manager, now));
        project.update(name, description, targetOrigin, now);
        if ("ARCHIVED".equals(project.getStatus())) project.restore(now);
        return projects.save(project);
    }

    private static void ensureMembership(ProjectEntity project, UserEntity user, String role,
            UserEntity manager, ProjectMemberRepository members, Instant now) {
        ProjectMemberEntity membership = members.findByProjectIdAndUserId(project.getId(), user.getId())
                .orElseGet(() -> new ProjectMemberEntity(project, user, role, now));
        membership.changeRole(role, now);
        membership.assignBy(manager);
        members.save(membership);
    }

    private static void removeMembership(ProjectEntity project, UserEntity user, ProjectMemberRepository members) {
        members.findByProjectIdAndUserId(project.getId(), user.getId()).ifPresent(members::delete);
    }

    private record FixtureUser(String email, String displayName, PlatformRole platformRole,
            String status, boolean verified) { }
}
