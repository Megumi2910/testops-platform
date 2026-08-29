package com.megumi.testops.project.service;

import java.net.InetAddress;
import java.net.URI;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.shared.api.ApiException;

@Component
public class TargetOriginNormalizer {
    private final PlatformProperties properties;

    public TargetOriginNormalizer(PlatformProperties properties) {
        this.properties = properties;
    }

    public String normalize(String value) {
        return normalize(value, true);
    }

    public String normalizeConfigured(String value) {
        return normalize(value, false);
    }

    private String normalize(String value, boolean enforceLocalDevelopmentPolicy) {
        if (value == null || value.isBlank()) throw invalid();
        URI uri;
        try {
            uri = URI.create(value.trim());
        } catch (IllegalArgumentException ex) {
            throw invalid();
        }
        if (!uri.isAbsolute() || !("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
            throw invalid();
        }
        String host = uri.getHost();
        if (enforceLocalDevelopmentPolicy && "localhost".equalsIgnoreCase(host) && !properties.target().localDevelopmentEnabled()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "local_target_disabled", "Local development targets are disabled");
        }
        if (isLiteralIp(host) && unsafeLiteral(host)) throw invalid();
        int port = uri.getPort();
        boolean defaultPort = ("http".equalsIgnoreCase(uri.getScheme()) && port == 80)
                || ("https".equalsIgnoreCase(uri.getScheme()) && port == 443);
        String authority = host.toLowerCase(Locale.ROOT) + (port == -1 || defaultPort ? "" : ":" + port);
        return uri.getScheme().toLowerCase(Locale.ROOT) + "://" + authority;
    }

    private static boolean isLiteralIp(String host) {
        return host.matches("[0-9.]+") || host.contains(":");
    }

    private static boolean unsafeLiteral(String host) {
        try {
            InetAddress address = InetAddress.getByName(host);
            return address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                    || address.isSiteLocalAddress() || address.isMulticastAddress();
        } catch (java.net.UnknownHostException ex) {
            return true;
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid_target_origin",
                "Enter an allowed HTTP(S) origin only; paths, credentials, queries, fragments, and unsafe IP addresses are not permitted");
    }
}
