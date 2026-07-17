package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

class LiveTargetSmokeIT {

    @Test
    void optionallyReachesOnlyAnAllowedTarget() throws Exception {
        String target = System.getenv("TARGET_SMOKE_URL");
        Assumptions.assumeTrue(target != null && !target.isBlank(), "TARGET_SMOKE_URL is not configured");

        URI targetUri = URI.create(target);
        assertTrue("https".equalsIgnoreCase(targetUri.getScheme()), "live smoke requires HTTPS");
        String allowedOrigins = System.getenv("TARGET_ALLOWED_ORIGINS");
        String configuredOrigins = allowedOrigins == null ? "" : allowedOrigins;
        List<String> allowed = Arrays.stream(configuredOrigins.split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
        String origin = targetUri.getScheme() + "://" + targetUri.getAuthority();
        assertTrue(allowed.contains(origin), "target is outside TARGET_ALLOWED_ORIGINS");

        HttpRequest request = HttpRequest.newBuilder(targetUri)
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build();
        HttpResponse<Void> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.discarding());
        assertTrue(response.statusCode() < 500, "target returned an infrastructure failure");
    }
}
