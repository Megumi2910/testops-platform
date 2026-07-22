#!/usr/bin/env bash
set -euo pipefail
force=false
generate_bootstrap_password=false
enable_email_delivery=false
enable_google=false
for argument in "$@"; do
  case "$argument" in
    --force) force=true ;;
    --generate-bootstrap-password) generate_bootstrap_password=true ;;
    --enable-email-delivery) enable_email_delivery=true ;;
    --enable-google) enable_google=true ;;
    *) printf 'Unknown option: %s\n' "$argument" >&2; exit 2 ;;
  esac
done
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
secret_dir="$root/backend/.secrets"
mkdir -p "$secret_dir"
copy_example() { local target="$root/$1/.env"; [[ -f "$target" ]] || cp "$target.example" "$target"; }
set_env() { local file="$1" key="$2" value="$3"; touch "$file"; grep -v "^${key}=" "$file" > "$file.tmp" || true; printf '%s=%s\n' "$key" "$value" >> "$file.tmp"; mv "$file.tmp" "$file"; }
for dir in postgres_db backend frontend pgadmin4; do copy_example "$dir"; done
if [[ "$force" == true || ! -f "$secret_dir/jwt-private.pem" ]]; then openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$secret_dir/jwt-private.pem" >/dev/null 2>&1; openssl pkey -in "$secret_dir/jwt-private.pem" -pubout -out "$secret_dir/jwt-public.pem" >/dev/null 2>&1; fi
[[ "$force" == true || -f "$secret_dir/email-otp-pepper" ]] || openssl rand -base64 32 > "$secret_dir/email-otp-pepper"
[[ "$force" == true || -f "$secret_dir/project-variable-key" ]] || openssl rand -base64 32 > "$secret_dir/project-variable-key"
if [[ "$force" == true || ! -f "$secret_dir/bootstrap-admin-password" ]]; then
  if [[ "$generate_bootstrap_password" == true ]]; then openssl rand -base64 36 > "$secret_dir/bootstrap-admin-password"; else read -r -s -p 'Bootstrap admin password (12+ characters): ' password; echo; printf '%s' "$password" > "$secret_dir/bootstrap-admin-password"; fi
fi
backend_env="$root/backend/.env"
if [[ "$force" == true || ! -f "$backend_env" ]]; then
  set_env "$backend_env" AUTH_ENABLED true
  set_env "$backend_env" AUTH_REGISTRATION_ENABLED "$enable_email_delivery"
  set_env "$backend_env" EMAIL_DELIVERY_ENABLED "$enable_email_delivery"
  set_env "$backend_env" GOOGLE_AUTH_ENABLED "$enable_google"
  set_env "$backend_env" JWT_PRIVATE_KEY_PATH /run/secrets/testops/jwt-private.pem
  set_env "$backend_env" JWT_PUBLIC_KEY_PATH /run/secrets/testops/jwt-public.pem
  set_env "$backend_env" EMAIL_OTP_PEPPER_PATH /run/secrets/testops/email-otp-pepper
  set_env "$backend_env" BOOTSTRAP_ADMIN_ENABLED true
  set_env "$backend_env" BOOTSTRAP_ADMIN_EMAIL admin@localhost.test
  set_env "$backend_env" BOOTSTRAP_ADMIN_DISPLAY_NAME 'Local administrator'
  set_env "$backend_env" BOOTSTRAP_ADMIN_PASSWORD_PATH /run/secrets/testops/bootstrap-admin-password
  set_env "$backend_env" PROJECT_SECRET_VARIABLES_ENABLED true
  set_env "$backend_env" PROJECT_VARIABLE_KEY_PATH /run/secrets/testops/project-variable-key
  set_env "$backend_env" EXECUTION_WORKER_ENABLED true
else
  echo 'backend/.env already exists; it was not modified. Use --force to merge authenticated local defaults.' >&2
fi
if [[ "$force" == true ]]; then
  pgadmin_env="$root/pgadmin4/.env"
  set_env "$pgadmin_env" PGADMIN_DEFAULT_EMAIL admin@localhost.test
  set_env "$pgadmin_env" PGADMIN_DEFAULT_PASSWORD "$(openssl rand -base64 24 | tr -d '\n')"
fi
echo 'Local files and ignored secrets are ready. Start with: docker compose up --build'
