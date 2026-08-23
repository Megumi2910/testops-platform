$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

$assertions = 0
function Assert-Throws {
    param([scriptblock]$Action, [string]$MessagePattern)
    try {
        & $Action
    } catch {
        if ($_.Exception.Message -notmatch $MessagePattern) {
            throw "Expected error matching '$MessagePattern', got '$($_.Exception.Message)'"
        }
        $script:assertions++
        return
    }
    throw "Expected an error matching '$MessagePattern'."
}

$revision = '0123456789abcdef0123456789abcdef01234567'
$inspectJson = @"
[{"Config":{"Labels":{"org.opencontainers.image.revision":"$revision"}},"State":{"Health":{"Status":"healthy"}}}]
"@
$contractState = Get-DockerContainerContractState -InspectJson $inspectJson
if ($contractState.Revision -ne $revision -or $contractState.Health -ne 'healthy') {
    throw 'Docker inspect JSON did not preserve revision and health provenance.'
}
$assertions++

$missingHealth = Get-DockerContainerContractState -InspectJson `
    '[{"Config":{"Labels":{}},"State":{}}]'
if ($missingHealth.Revision -ne '' -or $missingHealth.Health -ne 'missing') {
    throw 'Docker inspect JSON did not fail closed for missing provenance and health.'
}
$assertions++

Assert-Throws {
    Get-DockerContainerContractState -InspectJson 'not-json'
} 'valid JSON'

Assert-RevisionHealthContract -Service 'backend' -ExpectedRevision $revision -ActualRevision $revision -Health 'healthy'
$assertions++

Assert-Throws {
    Assert-RevisionHealthContract -Service 'backend' -ExpectedRevision $revision `
        -ActualRevision 'fedcba9876543210fedcba9876543210fedcba98' -Health 'healthy'
} 'revision mismatch'
Assert-Throws {
    Assert-RevisionHealthContract -Service 'frontend' -ExpectedRevision $revision -ActualRevision '' -Health 'healthy'
} 'no trustworthy OCI revision'
Assert-Throws {
    Assert-RevisionHealthContract -Service 'frontend' -ExpectedRevision $revision -ActualRevision 'unknown' -Health 'healthy'
} 'no trustworthy OCI revision'
Assert-Throws {
    Assert-RevisionHealthContract -Service 'backend' -ExpectedRevision 'short' -ActualRevision $revision -Health 'healthy'
} 'full Git commit'
foreach ($health in @('', 'missing', 'created', 'running', 'starting', 'unhealthy', 'exited')) {
    Assert-Throws {
        Assert-RevisionHealthContract -Service 'backend' -ExpectedRevision $revision -ActualRevision $revision -Health $health
    } 'health contract failed'
}

Write-Host "Revision and health contract PASS assertions=$assertions"
