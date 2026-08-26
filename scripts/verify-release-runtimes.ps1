[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedRevision,

    [string]$NormalProject = 'testops-m10a-final-normal',
    [string]$QaProject = 'testops-m10a-final-qa',
    [int]$NormalUiPort = 3100,
    [int]$QaUiPort = 3000,
    [int]$NormalApiPort = 8180,
    [int]$QaApiPort = 8080
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

function Assert-ComposeRuntime {
    param(
        [string]$Project,
        [string[]]$ComposeFiles,
        [int]$UiPort,
        [int]$ApiPort,
        [string]$Label
    )

    Assert-IsolatedComposeProjectName -ProjectName $Project -RepositoryRoot $repositoryRoot | Out-Null
    $args = New-ComposeArguments -ProjectName $Project -RepositoryRoot $repositoryRoot -ComposeFiles $ComposeFiles -Command 'ps' -CommandArguments @('--format', 'json')
    Push-Location $repositoryRoot
    try {
        $raw = Invoke-CheckedNative -FilePath 'docker' -Arguments $args -Activity "Read $Label runtime status" -CaptureOutput
        $rows = @($raw | ConvertFrom-Json)
    } finally { Pop-Location }
    foreach ($service in @('backend', 'frontend')) {
        $matches = @($rows | Where-Object { [string]$_.Service -eq $service })
        if ($matches.Count -ne 1) { throw "$Label runtime must expose exactly one $service service." }
        $row = $matches[0]
        if ([string]$row.State -ne 'running' -or ([string]$row.Health -and [string]$row.Health -ne 'healthy')) {
            throw "$Label $service is not healthy/running (state=$($row.State), health=$($row.Health))."
        }
    }

    foreach ($probe in @(
        @{ Uri = "http://127.0.0.1:$UiPort/"; Name = "$Label UI" },
        @{ Uri = "http://127.0.0.1:$ApiPort/actuator/health"; Name = "$Label API" }
    )) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $probe.Uri -TimeoutSec 15
            if ([int]$response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
        } catch { throw "$($probe.Name) smoke failed: $($_.Exception.Message)" }
    }

    & (Join-Path $PSScriptRoot 'verify-running-revisions.ps1') -ProjectName $Project -ComposeFiles $ComposeFiles -ExpectedRevision $ExpectedRevision -Services @('backend', 'frontend')
    if ($LASTEXITCODE -ne 0) { throw "$Label revision/health provenance failed." }
    Write-Output "Release runtime PASS label=$Label project=$Project revision=$($ExpectedRevision.ToLowerInvariant())"
}

Assert-ComposeRuntime -Project $NormalProject -ComposeFiles @('docker-compose.yml', 'docker-compose.e2e.yml') -UiPort $NormalUiPort -ApiPort $NormalApiPort -Label 'normal'
Assert-ComposeRuntime -Project $QaProject -ComposeFiles @('docker-compose.yml', 'docker-compose.qa.yml') -UiPort $QaUiPort -ApiPort $QaApiPort -Label 'qa'
Write-Output ('EVIDENCE_JSON:' + (@{
    kind = 'integration-test'
    assertions_total = 6
    assertions_failed = 0
    source = 'verified-local-command'
} | ConvertTo-Json -Compress))
