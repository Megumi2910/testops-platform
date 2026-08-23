param(
    [string]$ProjectName = 'testops-quality-gate',
    [string[]]$ComposeFiles = @('docker-compose.yml', 'docker-compose.qa.yml'),
    [string]$ExpectedRevision,
    [string[]]$Services = @('backend', 'frontend'),
    [ValidateRange(1, 3600)][int]$TimeoutSeconds = 120,
    [ValidateRange(1, 60)][int]$PollIntervalSeconds = 2,
    [switch]$IncludeEcommerce,
    [string]$EcommerceRepository = 'D:\Projects\ecommerce-web\webcky',
    [string]$EcommerceProjectName = 'testops-quality-gate-ecommerce'
)

$ErrorActionPreference = 'Stop'
$testopsRepository = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

function Assert-ServiceRevision {
    param(
        [string]$Repository,
        [string]$ComposeProject,
        [string[]]$Files,
        [string]$Service,
        [string]$Revision
    )

    $psArguments = New-ComposeArguments -ProjectName $ComposeProject -RepositoryRoot $Repository `
        -ComposeFiles $Files -Command 'ps' -CommandArguments @('-q', $Service)
    Push-Location $Repository
    try {
        $containerOutput = Invoke-CheckedNative -FilePath 'docker' -Arguments $psArguments `
            -Activity "Resolve $Service container for $ComposeProject" -CaptureOutput
        $containerIds = @($containerOutput -split '\s+' | Where-Object { $_ })
        if ($containerIds.Count -ne 1) {
            throw "$Service must resolve to exactly one running container in $ComposeProject; found $($containerIds.Count)."
        }
        $containerId = $containerIds[0]
        $actualRevision = Invoke-CheckedNative -FilePath 'docker' `
            -Arguments @('inspect', '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}', $containerId) `
            -Activity "Read $Service OCI revision" -CaptureOutput

        # Validate immutable provenance before waiting on health so a stale or
        # unlabeled container fails immediately instead of consuming timeout.
        Assert-RevisionHealthContract -Service $Service -ExpectedRevision $Revision `
            -ActualRevision $actualRevision -Health 'healthy'

        $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
        $health = ''
        do {
            $health = Invoke-CheckedNative -FilePath 'docker' `
                -Arguments @('inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}', $containerId) `
                -Activity "Read $Service health" -CaptureOutput
            if ($health -eq 'healthy') { break }
            if ($health -in @('unhealthy', 'missing')) {
                Assert-RevisionHealthContract -Service $Service -ExpectedRevision $Revision `
                    -ActualRevision $actualRevision -Health $health
            }
            if ([DateTimeOffset]::UtcNow -lt $deadline) {
                Start-Sleep -Seconds $PollIntervalSeconds
            }
        } while ([DateTimeOffset]::UtcNow -lt $deadline)

        Assert-RevisionHealthContract -Service $Service -ExpectedRevision $Revision `
            -ActualRevision $actualRevision -Health $health
        Write-Host "$Service PASS project=$ComposeProject revision=$actualRevision health=$health"
    } finally {
        Pop-Location
    }
}

Assert-IsolatedComposeProjectName -ProjectName $ProjectName -RepositoryRoot $testopsRepository | Out-Null
if ([string]::IsNullOrWhiteSpace($ExpectedRevision)) {
    $ExpectedRevision = Get-GitRevision -RepositoryRoot $testopsRepository
}
foreach ($service in $Services) {
    Assert-ServiceRevision -Repository $testopsRepository -ComposeProject $ProjectName `
        -Files $ComposeFiles -Service $service -Revision $ExpectedRevision
}

if ($IncludeEcommerce) {
    if (-not (Test-Path -LiteralPath $EcommerceRepository)) {
        throw "Ecommerce repository was not found at $EcommerceRepository."
    }
    Assert-IsolatedComposeProjectName -ProjectName $EcommerceProjectName -RepositoryRoot $EcommerceRepository | Out-Null
    $ecommerceRevision = Get-GitRevision -RepositoryRoot $EcommerceRepository
    foreach ($service in @('backend', 'frontend')) {
        Assert-ServiceRevision -Repository $EcommerceRepository -ComposeProject $EcommerceProjectName `
            -Files @('docker-compose.yml') -Service $service -Revision $ecommerceRevision
    }
}
