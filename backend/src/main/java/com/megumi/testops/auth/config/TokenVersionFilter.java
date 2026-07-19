package com.megumi.testops.auth.config;

import java.io.IOException;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import com.megumi.testops.auth.repository.UserRepository;

public class TokenVersionFilter extends OncePerRequestFilter {

    private final UserRepository users;

    public TokenVersionFilter(UserRepository users) { this.users = users; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken jwtAuthentication) {
            UUID userId;
            Object tokenVersionValue;
            try {
                userId = UUID.fromString(jwtAuthentication.getToken().getSubject());
                tokenVersionValue = jwtAuthentication.getToken().getClaims().get("token_version");
            } catch (IllegalArgumentException | NullPointerException exception) {
                reject(response);
                return;
            }
            if (tokenVersionValue instanceof Number tokenVersionClaim && users.findById(userId)
                    .map(user -> user.getTokenVersion() == tokenVersionClaim.intValue()
                            && "ACTIVE".equals(user.getStatus()))
                    .orElse(false)) {
                filterChain.doFilter(request, response);
                return;
            }
            reject(response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private static void reject(HttpServletResponse response) throws IOException {
        SecurityContextHolder.clearContext();
        response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Session is no longer valid");
    }
}
