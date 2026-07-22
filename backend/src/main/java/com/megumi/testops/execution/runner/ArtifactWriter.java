package com.megumi.testops.execution.runner;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.domain.ExecutionArtifactEntity;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;

@Component
public class ArtifactWriter {
    private final Path root;
    private final ExecutionArtifactRepository artifacts;
    public ArtifactWriter(PlatformProperties properties, ExecutionArtifactRepository artifacts) { this.root = properties.artifact().directory().toAbsolutePath().normalize(); this.artifacts = artifacts; }
    public void writeScreenshot(ExecutionEntity execution, TestCaseResultEntity result, byte[] bytes) { write(execution, result, "SCREENSHOT", "image/png", bytes, false); }
    public void writeTrace(ExecutionEntity execution, TestCaseResultEntity result, Path trace) { try { write(execution, result, "TRACE", "application/zip", Files.readAllBytes(trace), false); Files.deleteIfExists(trace); } catch (IOException ex) { throw new IllegalStateException("Unable to persist Playwright trace", ex); } }
    private void write(ExecutionEntity execution, TestCaseResultEntity result, String type, String contentType, byte[] bytes, boolean suppressed) {
        try { String relative = execution.getId() + "/" + result.getId() + "/" + UUID.randomUUID() + ("SCREENSHOT".equals(type) ? ".png" : ".zip"); Path file = root.resolve(relative).normalize(); if (!file.startsWith(root)) throw new IllegalStateException("Artifact path escaped root"); Files.createDirectories(file.getParent()); Files.write(file, bytes); String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); artifacts.save(new ExecutionArtifactEntity(execution, result, type, relative, contentType, bytes.length, hash, suppressed, Instant.now())); }
        catch (Exception ex) { throw new IllegalStateException("Unable to persist execution artifact", ex); }
    }
    public Path resolve(String relative) { Path file = root.resolve(relative).normalize(); if (!file.startsWith(root)) throw new IllegalArgumentException("Artifact path escaped root"); return file; }
}
