package com.megumi.testops.project.service;

import java.net.URI;
import java.time.Duration;

import org.springframework.stereotype.Component;
import com.megumi.testops.execution.runner.ManagedChromium;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Request;
import com.microsoft.playwright.Response;

@Component
public class TargetProbe {
    private final ManagedChromium chromium;
    private final ProjectTargetPolicy policy;
    public TargetProbe(ManagedChromium chromium, ProjectTargetPolicy policy) { this.chromium = chromium; this.policy = policy; }
    public ProbeResult probe(String origin) {
        try (BrowserContext context = chromium.newContext()) {
            context.setDefaultTimeout(10_000);
            context.route("**/*", route -> {
                Request request = route.request();
                if (request.isNavigationRequest() && !policy.isSameOrigin(origin, request.url())) {
                    route.abort();
                } else {
                    route.resume();
                }
            });
            Page page = context.newPage();
            Response response = page.navigate(origin, new Page.NavigateOptions().setTimeout(Duration.ofSeconds(10).toMillis()));
            if (response == null) return new ProbeResult(false, null, "TARGET_NO_RESPONSE");
            int status = response.status();
            return new ProbeResult(status >= 200 && status < 400, status, status >= 200 && status < 400 ? null : "TARGET_HTTP_" + status);
        } catch (Exception ex) { return new ProbeResult(false, null, safeReason(ex)); }
    }
    private static String safeReason(Exception ex) { String name = ex.getClass().getSimpleName().toUpperCase(java.util.Locale.ROOT); return name.contains("TIMEOUT") ? "TARGET_TIMEOUT" : "TARGET_UNREACHABLE"; }
    public record ProbeResult(boolean reachable, Integer httpStatus, String reason) { }
}
