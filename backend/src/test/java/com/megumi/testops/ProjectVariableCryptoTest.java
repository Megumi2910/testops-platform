package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.megumi.testops.config.ProjectProperties;
import com.megumi.testops.project.service.ProjectVariableCrypto;

class ProjectVariableCryptoTest {
    @TempDir Path temp;
    @Test void encryptsAndDecryptsWithAuthenticatedContext() throws Exception {
        Path key = temp.resolve("variable-key"); Files.write(key, new byte[32]); ProjectVariableCrypto crypto = new ProjectVariableCrypto(new ProjectProperties(true, key, 1));
        ProjectVariableCrypto.Encrypted encrypted = crypto.encrypt("project", "PASSWORD", "secret", 1);
        assertEquals("secret", crypto.decrypt("project", "PASSWORD", encrypted.ciphertext(), encrypted.nonce(), 1));
        assertThrows(IllegalStateException.class, () -> crypto.decrypt("project", "OTHER", encrypted.ciphertext(), encrypted.nonce(), 1));
    }
    @Test void disabledModeFailsClosed() { ProjectVariableCrypto crypto = new ProjectVariableCrypto(new ProjectProperties(false, null, 1)); assertThrows(IllegalStateException.class, () -> crypto.encrypt("p", "K", "v", 1)); }
}
