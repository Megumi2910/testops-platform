#!/usr/bin/env bash
set -euo pipefail

secret_dir="${1:-backend/.secrets}"
mkdir -p "$secret_dir"
umask 077

# E2E authentication is intentionally enabled, but these values must be
# generated per run and must never be committed or reused in development.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out "$secret_dir/jwt-private.pem" >/dev/null 2>&1
openssl rsa -pubout -in "$secret_dir/jwt-private.pem" \
  -out "$secret_dir/jwt-public.pem" >/dev/null 2>&1
openssl rand -hex 32 > "$secret_dir/email-otp-pepper"
# ProjectVariableCrypto accepts either raw 32 bytes or Base64 for a 256-bit AES key.
# Base64 keeps the disposable secret text-safe while decoding to exactly 32 bytes.
openssl rand -base64 32 > "$secret_dir/project-variable-key"
printf 'ci-e2e-bootstrap-password-%s\n' "$(openssl rand -hex 16)" \
  > "$secret_dir/bootstrap-admin-password"

# The backend container runs as a non-root user. These are disposable CI
# secrets, so read access is allowed while the workspace is mounted.
chmod 0644 "$secret_dir"/*
