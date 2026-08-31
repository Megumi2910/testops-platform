$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

$assertions = 0
function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "Assertion failed: $Message" }
    $script:assertions++
}
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

function Get-NginxLocationBlock {
    param([string]$Source, [string]$Marker)
    $start = $Source.IndexOf($Marker, [StringComparison]::Ordinal)
    if ($start -lt 0) { throw "Nginx location was not found: $Marker" }
    $brace = $Source.IndexOf('{', $start)
    $depth = 0
    for ($index = $brace; $index -lt $Source.Length; $index++) {
        if ($Source[$index] -eq '{') { $depth++ }
        if ($Source[$index] -eq '}') {
            $depth--
            if ($depth -eq 0) { return $Source.Substring($start, $index - $start + 1) }
        }
    }
    throw "Nginx location was not closed: $Marker"
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

$frontendDockerfile = Get-Content -Raw -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend\Dockerfile')
Assert-True ($frontendDockerfile -match 'ENV TESTOPS_REVISION=\$VCS_REF') `
    'frontend runtime receives the exact VCS_REF value'
Assert-True ($frontendDockerfile -match 'COPY nginx\.conf /etc/nginx/templates/default\.conf\.template') `
    'frontend Nginx configuration is rendered through the runtime template contract'

$nginxSource = Get-Content -Raw -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend\nginx.conf')
$revisionHeader = 'add_header X-TestOps-Revision "${TESTOPS_REVISION}" always;'
$securityHeaders = @(
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;'
)
foreach ($marker in @('location = /index.html', 'location / {', 'location ~* \.')) {
    $block = Get-NginxLocationBlock -Source $nginxSource -Marker $marker
    Assert-True ($block.Contains($revisionHeader)) "$marker stamps the exact frontend revision with always"
    foreach ($securityHeader in $securityHeaders) {
        Assert-True ($block.Contains($securityHeader)) "$marker preserves $securityHeader despite add_header inheritance"
    }
}
foreach ($marker in @('location /api/', 'location /oauth2/', 'location /login/oauth2/', 'location = /actuator/health', 'location /actuator/')) {
    $block = Get-NginxLocationBlock -Source $nginxSource -Marker $marker
    Assert-True (-not $block.Contains('X-TestOps-Revision')) "$marker remains outside frontend revision provenance"
}

Write-Host "Revision and health contract PASS assertions=$assertions"
