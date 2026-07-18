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
            try {
                UUID userId = UUID.fromString(jwtAuthentication.getToken().getSubject());
                Number tokenVersionClaim = jwtAuthentication.getToken().getClaim("token_version");
                if (tokenVersionClaim == null) throw new IllegalArgumentException("token version claim missing");
                int tokenVersion = tokenVersionClaim.intValue();
                if (users.findById(userId).map(user -> user.getTokenVersion() == tokenVersion && "ACTIVE".equals(user.getStatus())).orElse(false)) {
                    filterChain.doFilter(request, response);
                    return;
                }
            } catch (RuntimeException ignored) {
                // Fall through to a generic unauthorized response without exposing token details.
            }
            SecurityContextHolder.clearContext();
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Session is no longer valid");
            return;
        }
        filterChain.doFilter(request, response);
    }
}
