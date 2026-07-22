package com.megumi.testops.auth.config;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

public final class TestOpsJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private static final Set<String> ALLOWED_ROLES = Set.of("ADMIN", "MEMBER");

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String subject = jwt.getSubject();
        if (subject == null || subject.isBlank()) {
            throw new BadCredentialsException("Invalid subject claim");
        }
        try {
            java.util.UUID.fromString(subject);
        } catch (IllegalArgumentException exception) {
            throw new BadCredentialsException("Invalid subject claim", exception);
        }
        Object claim = jwt.getClaim("roles");
        if (!(claim instanceof Collection<?> values)) {
            throw new BadCredentialsException("Invalid role claim");
        }
        Set<SimpleGrantedAuthority> authorities = new LinkedHashSet<>();
        for (Object value : values) {
            if (!(value instanceof String role) || !ALLOWED_ROLES.contains(role)) {
                throw new BadCredentialsException("Invalid role claim");
            }
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
        }
        return new JwtAuthenticationToken(jwt, authorities, subject);
    }
}
