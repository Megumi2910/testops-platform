package com.megumi.testops.execution.runner;

import java.net.InetAddress;
import java.net.URI;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.megumi.testops.shared.api.ApiException;

@Component
public class ExecutionTargetGuard {
    public String resolve(String origin, String requested) {
        if (requested == null || requested.isBlank()) throw invalid();
        URI base = URI.create(origin); URI uri = URI.create(requested.trim());
        URI resolved = uri.isAbsolute() ? uri : base.resolve(uri);
        if (!("http".equalsIgnoreCase(resolved.getScheme()) || "https".equalsIgnoreCase(resolved.getScheme())) || resolved.getHost() == null || resolved.getUserInfo() != null) throw invalid();
        if (!sameOrigin(base, resolved) || unsafeHost(resolved.getHost())) throw invalid();
        return resolved.toString();
    }
    private static boolean sameOrigin(URI a, URI b) { return a.getScheme().equalsIgnoreCase(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost()) && effectivePort(a) == effectivePort(b); }
    private static int effectivePort(URI uri) { if (uri.getPort() != -1) return uri.getPort(); return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80; }
    private static boolean unsafeHost(String host) {
        String lower = host.toLowerCase(Locale.ROOT);
        if (lower.equals("localhost") || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.equals("0.0.0.0")) return true;
        try { for (InetAddress address : InetAddress.getAllByName(host)) if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress()) return true; return false; }
        catch (Exception ex) { return true; }
    }
    private static ApiException invalid() { return new ApiException(HttpStatus.BAD_REQUEST, "unsafe_target_url", "Navigation URL is outside the project target origin or resolves to a private address"); }
}
