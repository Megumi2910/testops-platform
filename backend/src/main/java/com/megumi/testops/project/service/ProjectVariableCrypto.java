package com.megumi.testops.project.service;

import java.nio.file.Files;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import com.megumi.testops.config.ProjectProperties;

@Component
public class ProjectVariableCrypto {
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();
    public ProjectVariableCrypto(ProjectProperties properties) {
        if (!properties.secretVariablesEnabled()) { key = null; return; }
        try {
            byte[] raw = Files.readAllBytes(properties.variableKeyPath());
            if (raw.length != 32) raw = Base64.getDecoder().decode(new String(raw, java.nio.charset.StandardCharsets.UTF_8).trim());
            if (raw.length != 32) throw new IllegalArgumentException("project variable key must be exactly 32 bytes");
            key = new SecretKeySpec(raw, "AES");
        } catch (Exception ex) { throw new IllegalStateException("Unable to load project variable encryption key", ex); }
    }
    public Encrypted encrypt(String projectId, String variableKey, String value, int version) {
        ensureEnabled(); byte[] nonce = new byte[12]; random.nextBytes(nonce);
        try { Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, nonce)); cipher.updateAAD((projectId + ":" + variableKey + ":" + version).getBytes(java.nio.charset.StandardCharsets.UTF_8)); return new Encrypted(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), nonce); }
        catch (GeneralSecurityException ex) { throw new IllegalStateException("Unable to encrypt project variable", ex); }
    }
    public String decrypt(String projectId, String variableKey, byte[] ciphertext, byte[] nonce, int version) {
        ensureEnabled();
        try { Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, nonce)); cipher.updateAAD((projectId + ":" + variableKey + ":" + version).getBytes(java.nio.charset.StandardCharsets.UTF_8)); return new String(cipher.doFinal(ciphertext), java.nio.charset.StandardCharsets.UTF_8); }
        catch (GeneralSecurityException ex) { throw new IllegalStateException("Unable to decrypt project variable", ex); }
    }
    private void ensureEnabled() { if (key == null) throw new IllegalStateException("Secret project variables are disabled"); }
    public record Encrypted(byte[] ciphertext, byte[] nonce) { }
}
