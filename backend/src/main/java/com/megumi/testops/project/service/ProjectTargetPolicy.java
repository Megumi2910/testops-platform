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
    private final PlatformProperties properties;
    public ProjectTargetPolicy(PlatformProperties properties) {
        this.properties = properties;
        this.allowed = properties.target().allowedOrigins().stream().map(ProjectTargetPolicy::normalize).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }
    public boolean isConfigured() { return !allowed.isEmpty(); }
    public boolean isAllowedOrigin(String value) {
        try {
            validate(value);
            return true;
        } catch (ApiException ex) {
            return false;
        }
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
        if ("localhost".equalsIgnoreCase(host) && !properties.target().localDevelopmentEnabled()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "local_target_disabled", "Local development targets are disabled");
        }
        if (isLiteralIp(host)) {
            try {
                InetAddress address = InetAddress.getByName(host);
                if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress() || address.isMulticastAddress()) throw invalid();
            } catch (java.net.UnknownHostException ex) { throw invalid(); }
        }
        String normalized = normalize(uri.toString());
        if (!allowed.contains(normalized)) throw new ApiException(HttpStatus.BAD_REQUEST, "target_not_allowed", "Target origin is not in the configured allowlist");
        return normalized;
    }
    public boolean isLocalDevelopmentOrigin(String origin) { return origin != null && URI.create(origin).getHost().equalsIgnoreCase("localhost"); }
    public boolean isSameOrigin(String expectedOrigin, String candidate) {
        try {
            URI expected = URI.create(expectedOrigin);
            URI actual = URI.create(candidate);
            return expected.getScheme().equalsIgnoreCase(actual.getScheme())
                    && expected.getHost().equalsIgnoreCase(actual.getHost())
                    && effectivePort(expected) == effectivePort(actual);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }
    private static boolean isLiteralIp(String host) { return host.matches("[0-9.]+") || host.contains(":"); }
    private static String normalize(String value) {
        URI uri = URI.create(value.trim());
        return uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getRawAuthority().toLowerCase(Locale.ROOT);
    }
    private static int effectivePort(URI uri) { if (uri.getPort() != -1) return uri.getPort(); return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80; }
    private static ApiException invalid() { return new ApiException(HttpStatus.BAD_REQUEST, "invalid_target_origin", "Target must be an allowed HTTP(S) origin without credentials, paths, queries, fragments, or ports"); }
}
