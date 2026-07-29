package com.megumi.testops.execution.runner;

import java.util.List;

import org.springframework.stereotype.Component;

import com.megumi.testops.config.PlatformProperties;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Playwright;

import jakarta.annotation.PreDestroy;

/** Owns the single managed Chromium process while each operation receives an isolated context. */
@Component
public class ManagedChromium {
    private final PlatformProperties properties;
    private volatile Playwright playwright;
    private volatile Browser browser;

    public ManagedChromium(PlatformProperties properties) {
        this.properties = properties;
    }

    public BrowserContext newContext() {
        return browser().newContext();
    }

    private Browser browser() {
        if (browser != null) return browser;
        synchronized (this) {
            if (browser == null) {
                playwright = Playwright.create();
                BrowserType.LaunchOptions options = new BrowserType.LaunchOptions().setHeadless(true);
                if (properties.target().localDevelopmentEnabled()) {
                    options.setArgs(List.of("--host-resolver-rules=MAP localhost " + properties.target().localHostAlias()));
                }
                browser = playwright.chromium().launch(options);
            }
            return browser;
        }
    }

    @PreDestroy
    public synchronized void close() {
        if (browser != null) browser.close();
        if (playwright != null) playwright.close();
        browser = null;
        playwright = null;
    }
}
