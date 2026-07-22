package com.megumi.testops.project.service;

import java.net.InetAddress;
import java.net.URI;
import java.util.Locale;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.shared.api.ApiException;

@Component
public class ProjectTargetPolicy {
    private final Set<String> allowed;
    public ProjectTargetPolicy(PlatformProperties properties) {
        this.allowed = properties.target().allowedOrigins().stream().map(ProjectTargetPolicy::normalize).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }
    public String validate(String value) {
        if (value == null || value.isBlank()) throw invalid();
        URI uri;
        try { uri = URI.create(value.trim()); } catch (IllegalArgumentException ex) { throw invalid(); }
        if (!uri.isAbsolute() || !("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
            throw invalid();
        }
        String host = uri.getHost();
        if (isLiteralIp(host)) {
            try {
                InetAddress address = InetAddress.getByName(host);
                if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress() || address.isMulticastAddress()) throw invalid();
            } catch (java.net.UnknownHostException ex) { throw invalid(); }
        }
        String normalized = normalize(uri.toString());
        if (!allowed.isEmpty() && !allowed.contains(normalized)) throw new ApiException(HttpStatus.BAD_REQUEST, "target_not_allowed", "Target origin is not in the configured allowlist");
        return normalized;
    }
    private static boolean isLiteralIp(String host) { return host.matches("[0-9.]+") || host.contains(":"); }
    private static String normalize(String value) {
        URI uri = URI.create(value.trim());
        return uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getRawAuthority().toLowerCase(Locale.ROOT);
    }
    private static ApiException invalid() { return new ApiException(HttpStatus.BAD_REQUEST, "invalid_target_origin", "Target must be an allowed HTTP(S) origin without credentials, paths, queries, fragments, or ports"); }
}
