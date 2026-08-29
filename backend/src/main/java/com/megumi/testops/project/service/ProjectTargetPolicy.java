package com.megumi.testops.project.service;

import java.net.URI;
import org.springframework.stereotype.Component;

import com.megumi.testops.shared.api.ApiException;

@Component
public class ProjectTargetPolicy {
    private final TargetOriginNormalizer normalizer;
    private final TargetOriginRegistry origins;

    public ProjectTargetPolicy(TargetOriginNormalizer normalizer, TargetOriginRegistry origins) {
        this.normalizer = normalizer;
        this.origins = origins;
    }

    public boolean isConfigured() { return origins.isConfigured(); }
    public boolean isAllowedOrigin(String value) {
        try {
            validate(value);
            return true;
        } catch (ApiException ex) {
            return false;
        }
    }
    public String validate(String value) {
        String normalized = normalizer.normalize(value);
        if (!origins.isEnabled(normalized)) throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "target_not_allowed", "Target origin is not enabled in the allowlist");
        return normalized;
    }
    public String normalize(String origin) { return normalizer.normalize(origin); }
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
    private static int effectivePort(URI uri) { if (uri.getPort() != -1) return uri.getPort(); return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80; }
}
