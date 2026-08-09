param([string]$EcommerceRepository = 'D:\Projects\ecommerce-web\webcky')

$ErrorActionPreference = 'Stop'
$testopsRepository = Split-Path -Parent $PSScriptRoot

function Assert-ServiceRevision([string]$repository, [string[]]$composeFiles,
        [string]$service, [string]$expectedRevision) {
    Push-Location $repository
    try {
        $arguments = @('compose')
        foreach ($file in $composeFiles) { $arguments += @('-f', $file) }
        $containerId = (& docker @arguments ps -q $service).Trim()
        if (-not $containerId) { throw "$service is not running in $repository" }
        $actualRevision = (& docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' $containerId).Trim()
        if ($actualRevision -ne $expectedRevision) {
            throw "$service revision mismatch: expected $expectedRevision, running $actualRevision"
        }
        $deadline = [DateTimeOffset]::UtcNow.AddMinutes(2)
        do {
            $health = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId).Trim()
            if ($health -in @('healthy', 'running')) { break }
            if ($health -in @('unhealthy', 'exited', 'dead')) { throw "$service is $health" }
            Start-Sleep -Seconds 2
        } while ([DateTimeOffset]::UtcNow -lt $deadline)
        if ($health -notin @('healthy', 'running')) { throw "$service did not become healthy; last state=$health" }
        Write-Host "$service PASS revision=$actualRevision health=$health"
    } finally { Pop-Location }
}

$testopsRevision = (& git -C $testopsRepository rev-parse HEAD).Trim()
$ecommerceRevision = (& git -C $EcommerceRepository rev-parse HEAD).Trim()

Assert-ServiceRevision $testopsRepository @('docker-compose.yml', 'docker-compose.qa.yml') 'backend' $testopsRevision
Assert-ServiceRevision $testopsRepository @('docker-compose.yml', 'docker-compose.qa.yml') 'frontend' $testopsRevision
Assert-ServiceRevision $EcommerceRepository @('docker-compose.yml') 'backend' $ecommerceRevision
Assert-ServiceRevision $EcommerceRepository @('docker-compose.yml') 'frontend' $ecommerceRevision
