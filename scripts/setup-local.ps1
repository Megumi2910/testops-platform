param(
    [switch]$Force,
    [switch]$GenerateBootstrapPassword,
    [switch]$EnableEmailDelivery,
    [switch]$EnableGoogle,
    [string[]]$TargetAllowedOrigins
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')
$backend = Join-Path $root 'backend'
$secretDir = Join-Path $backend '.secrets'
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null

function Write-Secret([string]$path, [string]$value) {
    if ((Test-Path -LiteralPath $path) -and -not $Force) { return }
    [IO.File]::WriteAllText($path, $value)
}
function Set-EnvValue([string]$path, [string]$key, [string]$value) {
    $lines = if (Test-Path -LiteralPath $path) { @(Get-Content -LiteralPath $path) } else { @() }
    $lines = @($lines | Where-Object { $_ -notmatch "^$([regex]::Escape($key))=" })
    $lines += "$key=$value"
    [IO.File]::WriteAllLines($path, $lines)
}
function Copy-Example([string]$directory) {
    $target = Join-Path $root "$directory/.env"; $example = "$target.example"
    if (-not (Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath $example -Destination $target }
}
function New-RandomBase64([int]$length = 32) {
    $bytes = New-CryptographicRandomBytes -Length $length
    return [Convert]::ToBase64String($bytes)
}

foreach ($directory in @('postgres_db', 'backend', 'frontend', 'pgadmin4')) { Copy-Example $directory }
$privateKeyPath = Join-Path $secretDir 'jwt-private.pem'
$publicKeyPath = Join-Path $secretDir 'jwt-public.pem'
if ($Force -or -not (Test-Path -LiteralPath $privateKeyPath) -or -not (Test-Path -LiteralPath $publicKeyPath)) {
    # Regenerate both halves together so an interrupted/partial local setup can
    # never leave a private key paired with an unrelated public key.
    New-RsaPemKeyPair -PrivateKeyPath $privateKeyPath -PublicKeyPath $publicKeyPath
}
Write-Secret (Join-Path $secretDir 'email-otp-pepper') (New-RandomBase64)
Write-Secret (Join-Path $secretDir 'project-variable-key') (New-RandomBase64)

$bootstrapPasswordPath = Join-Path $secretDir 'bootstrap-admin-password'
if ($GenerateBootstrapPassword) {
    Write-Secret $bootstrapPasswordPath (New-RandomBase64 36)
} elseif ($Force -or -not (Test-Path -LiteralPath $bootstrapPasswordPath)) {
    $password = Read-Host 'Bootstrap admin password (12+ characters)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    try { Write-Secret $bootstrapPasswordPath ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$backendEnv = Join-Path $backend '.env'
if ($Force -or -not (Test-Path -LiteralPath $backendEnv)) {
    $emailEnabled = if ($EnableEmailDelivery) { 'true' } else { 'false' }
    $googleEnabled = if ($EnableGoogle) { 'true' } else { 'false' }
    Set-EnvValue $backendEnv 'AUTH_ENABLED' 'true'
    Set-EnvValue $backendEnv 'AUTH_REGISTRATION_ENABLED' $emailEnabled
    Set-EnvValue $backendEnv 'EMAIL_DELIVERY_ENABLED' $emailEnabled
    Set-EnvValue $backendEnv 'GOOGLE_AUTH_ENABLED' $googleEnabled
    Set-EnvValue $backendEnv 'JWT_PRIVATE_KEY_PATH' '/run/secrets/testops/jwt-private.pem'
    Set-EnvValue $backendEnv 'JWT_PUBLIC_KEY_PATH' '/run/secrets/testops/jwt-public.pem'
    Set-EnvValue $backendEnv 'EMAIL_OTP_PEPPER_PATH' '/run/secrets/testops/email-otp-pepper'
    Set-EnvValue $backendEnv 'BOOTSTRAP_ADMIN_ENABLED' 'true'
    Set-EnvValue $backendEnv 'BOOTSTRAP_ADMIN_EMAIL' 'admin@localhost.test'
    Set-EnvValue $backendEnv 'BOOTSTRAP_ADMIN_DISPLAY_NAME' 'Local administrator'
    Set-EnvValue $backendEnv 'BOOTSTRAP_ADMIN_PASSWORD_PATH' '/run/secrets/testops/bootstrap-admin-password'
    Set-EnvValue $backendEnv 'PROJECT_SECRET_VARIABLES_ENABLED' 'true'
    Set-EnvValue $backendEnv 'PROJECT_VARIABLE_KEY_PATH' '/run/secrets/testops/project-variable-key'
    Set-EnvValue $backendEnv 'EXECUTION_WORKER_ENABLED' 'true'
} else {
    Write-Warning 'backend/.env already exists; it was not modified. Use -Force to merge authenticated local defaults.'
}

if ($Force) {
    $pgadminEnv = Join-Path $root 'pgadmin4/.env'
    Set-EnvValue $pgadminEnv 'PGADMIN_DEFAULT_EMAIL' 'admin@testops.example.com'
    Set-EnvValue $pgadminEnv 'PGADMIN_DEFAULT_PASSWORD' (New-RandomBase64 24)
}
if ($Force -and $TargetAllowedOrigins.Count -gt 0) {
    Set-EnvValue (Join-Path $backend '.env') 'TARGET_ALLOWED_ORIGINS' ($TargetAllowedOrigins -join ',')
}
Write-Host 'Local files and ignored secrets are ready. Start with: docker compose up --build'
