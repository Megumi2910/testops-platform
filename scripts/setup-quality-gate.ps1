param(
    [string]$EcommerceRepository = 'D:\Projects\ecommerce-web\webcky',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $root 'backend\.secrets'
$qaPasswordPath = Join-Path $secretDirectory 'qa-fixture-password'

if (-not (Test-Path -LiteralPath $qaPasswordPath)) {
    New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null
    $bytes = New-Object byte[] 36
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    [IO.File]::WriteAllText($qaPasswordPath, [Convert]::ToBase64String($bytes))
    Write-Host "Created ignored QA fixture password: $qaPasswordPath"
}

$requiredSecrets = @('jwt-private.pem', 'jwt-public.pem', 'email-otp-pepper', 'project-variable-key')
$missingSecrets = @($requiredSecrets | Where-Object { -not (Test-Path -LiteralPath (Join-Path $secretDirectory $_)) })
if ($missingSecrets.Count -gt 0) {
    & (Join-Path $PSScriptRoot 'setup-local.ps1') -GenerateBootstrapPassword
}

if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot 'rebuild-quality-gate.ps1') -EcommerceRepository $EcommerceRepository
}

Write-Host 'QA fixture identities use the qa.*@testops.local namespace.'
Write-Host "The shared password remains only in $qaPasswordPath"
