package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import com.megumi.testops.auth.service.OtpHasher;

class OtpHasherTest {

    @Test
    void hashesAndComparesOtpWithoutStoringPlaintext() throws Exception {
        Path pepper = Files.createTempFile("testops-otp", ".pepper");
        Files.write(pepper, "a sufficiently long local test pepper value".getBytes());
        OtpHasher hasher = new OtpHasher(pepper);

        String hash = hasher.hash("user@example.com", "123456");

        assertNotEquals("123456", hash);
        assertTrue(hasher.matches("user@example.com", "123456", hash));
        assertFalse(hasher.matches("user@example.com", "654321", hash));
        Files.deleteIfExists(pepper);
    }
}
