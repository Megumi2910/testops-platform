package com.megumi.testops.auth.service;

import java.util.LinkedHashSet;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.megumi.testops.auth.domain.PlatformRole;
import com.megumi.testops.auth.domain.UserEntity;

@Service
public class PlatformPermissionService {
    public static final String PROJECT_CREATE = "PROJECT_CREATE";
    public static final String USER_ADMINISTER = "USER_ADMINISTER";
    public static final String OPERATIONS_VIEW = "OPERATIONS_VIEW";

    public Set<String> permissions(UserEntity user) {
        LinkedHashSet<String> permissions = new LinkedHashSet<>();
        if (isActiveVerified(user)) permissions.add(PROJECT_CREATE);
        if (user.getPlatformRole() == PlatformRole.ADMIN) {
            permissions.add(USER_ADMINISTER);
            permissions.add(OPERATIONS_VIEW);
        }
        return Set.copyOf(permissions);
    }

    public boolean canCreateProject(UserEntity user) {
        return isActiveVerified(user);
    }

    private static boolean isActiveVerified(UserEntity user) {
        return user != null && user.isEmailVerified() && "ACTIVE".equals(user.getStatus());
    }
}
