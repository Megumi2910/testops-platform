param([string]$ProjectName = 'testops-compose-contract')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

Assert-IsolatedComposeProjectName -ProjectName $ProjectName -RepositoryRoot $root | Out-Null
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required to validate Compose configurations.'
}

$profiles = @(
    [pscustomobject]@{ Name = 'normal'; Files = @('docker-compose.yml'); Expected = @('testops_refresh', 'testops_oauth_session') },
    [pscustomobject]@{ Name = 'qa'; Files = @('docker-compose.yml', 'docker-compose.qa.yml'); Expected = @('http://localhost:3300', 'testops_qa_refresh', 'testops_qa_oauth_session', 'GOOGLE_AUTH_ENABLED') },
    [pscustomobject]@{ Name = 'e2e-enabled'; Files = @('docker-compose.yml', 'docker-compose.e2e.yml'); Expected = @('testops_e2e_refresh', 'testops_e2e_oauth_session') },
    [pscustomobject]@{ Name = 'e2e-local-disabled'; Files = @('docker-compose.yml', 'docker-compose.e2e.yml', 'docker-compose.e2e-local-disabled.yml'); Expected = @() },
    # Browser-crash verification deliberately uses the enabled E2E topology;
    # the browser process is crashed by the test, not by a Compose override.
    [pscustomobject]@{ Name = 'browser-crash'; Files = @('docker-compose.yml', 'docker-compose.e2e.yml'); Expected = @() }
)

Push-Location $root
try {
    foreach ($profile in $profiles) {
        foreach ($file in $profile.Files) {
            if (-not (Test-Path -LiteralPath $file)) {
                throw "Compose profile $($profile.Name) references missing file $file."
            }
        }
        $arguments = New-ComposeArguments -ProjectName $ProjectName -RepositoryRoot $root `
            -ComposeFiles $profile.Files -Command 'config' -CommandArguments @('--quiet')
        Invoke-CheckedNative -FilePath 'docker' -Arguments $arguments `
            -Activity "Parse Compose profile $($profile.Name)"
        $renderArguments = New-ComposeArguments -ProjectName $ProjectName -RepositoryRoot $root `
            -ComposeFiles $profile.Files -Command 'config' -CommandArguments @('--format', 'json')
        $rendered = Invoke-CheckedNative -FilePath 'docker' -Arguments $renderArguments `
            -Activity "Render Compose profile $($profile.Name)" -CaptureOutput
        foreach ($required in @($profile.Expected)) {
            if ($rendered -notmatch [regex]::Escape($required)) {
                throw "Compose profile $($profile.Name) is missing required rendered value '$required'."
            }
        }
        if ($profile.Name -eq 'qa' -and $rendered -notmatch '"GOOGLE_AUTH_ENABLED"\s*:\s*"false"') {
            throw 'QA Compose profile must explicitly disable Google OAuth.'
        }
        Write-Host "Compose config PASS profile=$($profile.Name) files=$($profile.Files -join ',')"
    }
} finally {
    Pop-Location
}

Write-Host "Compose configuration contract PASS profiles=$($profiles.Count)"
