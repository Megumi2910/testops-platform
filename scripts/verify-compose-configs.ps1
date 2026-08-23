param([string]$ProjectName = 'testops-compose-contract')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

Assert-IsolatedComposeProjectName -ProjectName $ProjectName -RepositoryRoot $root | Out-Null
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required to validate Compose configurations.'
}

$profiles = @(
    [pscustomobject]@{ Name = 'normal'; Files = @('docker-compose.yml') },
    [pscustomobject]@{ Name = 'qa'; Files = @('docker-compose.yml', 'docker-compose.qa.yml') },
    [pscustomobject]@{ Name = 'e2e-enabled'; Files = @('docker-compose.yml', 'docker-compose.e2e.yml') },
    [pscustomobject]@{ Name = 'e2e-local-disabled'; Files = @('docker-compose.yml', 'docker-compose.e2e.yml', 'docker-compose.e2e-local-disabled.yml') },
    # Browser-crash verification deliberately uses the enabled E2E topology;
    # the browser process is crashed by the test, not by a Compose override.
    [pscustomobject]@{ Name = 'browser-crash'; Files = @('docker-compose.yml', 'docker-compose.e2e.yml') }
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
        Write-Host "Compose config PASS profile=$($profile.Name) files=$($profile.Files -join ',')"
    }
} finally {
    Pop-Location
}

Write-Host "Compose configuration contract PASS profiles=$($profiles.Count)"
