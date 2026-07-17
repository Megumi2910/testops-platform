package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import org.junit.jupiter.api.Test;

class PlaywrightLaunchIT {

    @Test
    void launchesChromiumAndRendersDeterministicMarkup() {
        try (Playwright playwright = Playwright.create();
             Browser browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
             BrowserContext context = browser.newContext()) {
            Page page = context.newPage();
            page.setContent("<main><h1>TestOps browser probe</h1></main>");
            assertEquals("TestOps browser probe", page.locator("h1").textContent());
        }
    }
}
