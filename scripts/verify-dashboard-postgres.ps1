[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$containerName = "testops-dashboard-it-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$containerStarted = $false
$mavenExitCode = 1

Push-Location (Join-Path $repositoryRoot "backend")
try {
    $containerId = docker run --rm --name $containerName `
        --health-cmd "pg_isready -U testops_it -d testops_it" `
        --health-interval 2s --health-timeout 2s --health-retries 30 `
        -e POSTGRES_USER=testops_it `
        -e POSTGRES_PASSWORD=testops_it `
        -e POSTGRES_DB=testops_it `
        -p 127.0.0.1::5432 `
        -d postgres:18.4-alpine3.24
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
        throw "Failed to create the isolated PostgreSQL container."
    }
    $containerStarted = $true

    $health = "starting"
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $health = docker inspect --format '{{.State.Health.Status}}' $containerName
        if ($health -eq "healthy") { break }
        Start-Sleep -Seconds 2
    }
    if ($health -ne "healthy") {
        throw "The isolated PostgreSQL container did not become healthy."
    }

    $databasePort = docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' $containerName
    if ([string]::IsNullOrWhiteSpace($databasePort)) {
        throw "Docker did not publish an isolated PostgreSQL port."
    }

    $env:TEST_DATABASE_URL = "jdbc:postgresql://localhost:$databasePort/testops_it"
    $env:TEST_DATABASE_USERNAME = "testops_it"
    $env:TEST_DATABASE_PASSWORD = "testops_it"
    & .\mvnw.cmd "-Dit.test=ApplicationContextIT" verify
    $mavenExitCode = $LASTEXITCODE
}
finally {
    if ($containerStarted) {
        docker stop $containerName | Out-Null
    }
    Pop-Location
}

exit $mavenExitCode
